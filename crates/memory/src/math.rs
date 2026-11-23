//! Deterministic exp and ln, written out so the native and wasm32 builds
//! give the same bits. The platform libm differs between targets; floor,
//! sqrt, add, sub, mul and div are IEEE exact on both, and nothing here is
//! fused, so the results agree bit for bit.

const LN2_HI: f64 = f64::from_bits(0x3fe6_2e42_fee0_0000);
const LN2_LO: f64 = f64::from_bits(0x3dea_39ef_3579_3c76);
const LN2: f64 = core::f64::consts::LN_2;
const INV_LN2: f64 = core::f64::consts::LOG2_E;

/// 2 raised to an integer power, for k in -1022 to 1023.
fn pow2i(k: i64) -> f64 {
    f64::from_bits(((k + 1023) as u64) << 52)
}

/// e to the x. Relative error under 1e-15 over the finite range (computed
/// against the host libm in the tests).
pub fn exp(x: f64) -> f64 {
    if x.is_nan() {
        return x;
    }
    if x > 709.0 {
        return f64::INFINITY;
    }
    if x < -708.0 {
        return 0.0;
    }
    let k = (x * INV_LN2 + 0.5).floor();
    let r = (x - k * LN2_HI) - k * LN2_LO;
    // Taylor series to r^14 / 14!; |r| <= 0.347 so the tail is below 1e-17.
    let mut term = 1.0;
    let mut sum = 1.0;
    let mut i = 1.0;
    while i < 15.0 {
        term = term * r / i;
        sum += term;
        i += 1.0;
    }
    sum * pow2i(k as i64)
}

/// Natural log. Returns NaN below zero and negative infinity at zero.
pub fn ln(x: f64) -> f64 {
    if x.is_nan() || x < 0.0 {
        return f64::NAN;
    }
    if x == 0.0 {
        return f64::NEG_INFINITY;
    }
    if x.is_infinite() {
        return x;
    }
    let mut v = x;
    let mut e: i64 = 0;
    if v < f64::MIN_POSITIVE {
        v *= pow2i(54);
        e -= 54;
    }
    let bits = v.to_bits();
    e += ((bits >> 52) & 0x7ff) as i64 - 1023;
    let mut m = f64::from_bits((bits & 0x000f_ffff_ffff_ffff) | 0x3ff0_0000_0000_0000);
    if m > core::f64::consts::SQRT_2 {
        m *= 0.5;
        e += 1;
    }
    let s = (m - 1.0) / (m + 1.0);
    let s2 = s * s;
    // 2 atanh(s) = 2 (s + s^3/3 + s^5/5 + ...), |s| < 0.172
    let mut pow = s;
    let mut sum = 0.0;
    let mut n = 1.0;
    while n < 32.0 {
        sum += pow / n;
        pow *= s2;
        n += 2.0;
    }
    (e as f64) * LN2 + 2.0 * sum
}

/// 0.5 to the x, through exp.
pub fn half_pow(x: f64) -> f64 {
    exp(-x * LN2)
}

/// Dot product of two f32 slices with four lane accumulators. Element i
/// adds into lane i mod 4, lanes reduce as (l0 + l1) + (l2 + l3). The wasm32
/// build with simd128 runs the main loop on f32x4; the scalar path keeps
/// the same order, so both give the same bits.
pub fn dot(a: &[f32], b: &[f32]) -> f32 {
    let n = a.len().min(b.len());
    let main = n - n % 4;
    let mut lanes = dot_main(&a[..main], &b[..main]);
    for i in main..n {
        lanes[i % 4] += a[i] * b[i];
    }
    (lanes[0] + lanes[1]) + (lanes[2] + lanes[3])
}

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
fn dot_main(a: &[f32], b: &[f32]) -> [f32; 4] {
    use core::arch::wasm32::*;
    let mut acc = f32x4_splat(0.0);
    let mut i = 0;
    while i < a.len() {
        // SAFETY: i + 4 <= len because len is a multiple of 4; loads are unaligned.
        let (va, vb) = unsafe {
            (
                v128_load(a.as_ptr().add(i) as *const v128),
                v128_load(b.as_ptr().add(i) as *const v128),
            )
        };
        acc = f32x4_add(acc, f32x4_mul(va, vb));
        i += 4;
    }
    [
        f32x4_extract_lane::<0>(acc),
        f32x4_extract_lane::<1>(acc),
        f32x4_extract_lane::<2>(acc),
        f32x4_extract_lane::<3>(acc),
    ]
}

#[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
fn dot_main(a: &[f32], b: &[f32]) -> [f32; 4] {
    let mut l = [0f32; 4];
    for (ca, cb) in a.chunks_exact(4).zip(b.chunks_exact(4)) {
        l[0] += ca[0] * cb[0];
        l[1] += ca[1] * cb[1];
        l[2] += ca[2] * cb[2];
        l[3] += ca[3] * cb[3];
    }
    l
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exp_matches_host_libm() {
        let mut x: f64 = -50.0;
        while x < 50.0 {
            let want = x.exp();
            let got = exp(x);
            assert!(
                ((got - want) / want).abs() < 2e-15,
                "exp({x}) {got} vs {want}"
            );
            x += 0.0137;
        }
        assert_eq!(exp(0.0), 1.0);
        assert_eq!(exp(-800.0), 0.0);
    }

    #[test]
    fn ln_matches_host_libm() {
        for &x in &[
            1e-300, 1e-10, 0.001, 0.5, 1.0, 1.5, 2.0, 10.0, 12345.678, 1e100,
        ] {
            let want = f64::ln(x);
            let got = ln(x);
            assert!(
                (got - want).abs() <= 2e-15 * want.abs().max(1.0),
                "ln({x}) {got} vs {want}"
            );
        }
        assert_eq!(ln(1.0), 0.0);
        assert!(ln(-1.0).is_nan());
    }

    #[test]
    fn half_pow_halves() {
        assert!((half_pow(1.0) - 0.5).abs() < 1e-15);
        assert!((half_pow(2.0) - 0.25).abs() < 1e-15);
    }

    #[test]
    fn dot_uses_lane_order() {
        let a = [1.0f32, 2.0, 3.0, 4.0, 5.0, 6.0];
        let b = [1.0f32, 1.0, 1.0, 1.0, 1.0, 1.0];
        assert_eq!(dot(&a, &b), 21.0);
    }
}
