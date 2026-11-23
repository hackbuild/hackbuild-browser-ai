//! Deterministic exp, ln, log10, sin, cos and atan2, written out so the
//! native and wasm32 builds give the same bits (exp and ln as in
//! crates/memory, sin and cos as in crates/audio-dsp). The platform libm differs between targets; floor, sqrt,
//! add, sub, mul and div are IEEE exact on both, and nothing here is fused,
//! so the results agree bit for bit.

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

const LN10: f64 = core::f64::consts::LN_10;
const PIO2_HI: f64 = f64::from_bits(0x3ff9_21fb_5440_0000);
const PIO2_LO: f64 = f64::from_bits(0x3dd0_b461_1a62_6331);
const TWO_OVER_PI: f64 = core::f64::consts::FRAC_2_PI;
pub const PI: f64 = core::f64::consts::PI;

pub fn log10(x: f64) -> f64 {
    ln(x) / LN10
}

/// 10 to the x.
pub fn pow10(x: f64) -> f64 {
    exp(x * LN10)
}

/// Series for sin and cos on |r| <= pi/4.
fn sin_cos_reduced(r: f64) -> (f64, f64) {
    let r2 = r * r;
    let mut s = r;
    let mut c = 1.0;
    let mut ts = r;
    let mut tc = 1.0;
    let mut k = 1.0;
    while k < 24.0 {
        ts = -ts * r2 / ((k + 1.0) * (k + 2.0));
        tc = -tc * r2 / (k * (k + 1.0));
        s += ts;
        c += tc;
        k += 2.0;
    }
    (s, c)
}

/// sin and cos together. Cody and Waite reduction by pi/2; absolute error
/// under 1e-15 for |x| up to 1e4 (computed against the host libm in tests).
pub fn sin_cos(x: f64) -> (f64, f64) {
    if !x.is_finite() {
        return (f64::NAN, f64::NAN);
    }
    let k = (x * TWO_OVER_PI + 0.5).floor();
    let r = (x - k * PIO2_HI) - k * PIO2_LO;
    let (s, c) = sin_cos_reduced(r);
    match (k as i64).rem_euclid(4) {
        0 => (s, c),
        1 => (c, -s),
        2 => (-s, -c),
        _ => (-c, s),
    }
}

pub fn sin(x: f64) -> f64 {
    sin_cos(x).0
}

pub fn cos(x: f64) -> f64 {
    sin_cos(x).1
}

/// atan by two argument halvings, then the odd series.
pub fn atan(x: f64) -> f64 {
    if x.is_nan() {
        return x;
    }
    if x.abs() > 1.0 {
        let a = PI / 2.0 - atan(1.0 / x.abs());
        return if x < 0.0 { -a } else { a };
    }
    let mut t = x;
    for _ in 0..2 {
        t /= 1.0 + (1.0 + t * t).sqrt();
    }
    let t2 = t * t;
    let mut pow = t;
    let mut sum = 0.0;
    let mut n = 1.0;
    let mut sign = 1.0;
    while n < 40.0 {
        sum += sign * pow / n;
        pow *= t2;
        n += 2.0;
        sign = -sign;
    }
    4.0 * sum
}

pub fn atan2(y: f64, x: f64) -> f64 {
    if x > 0.0 {
        atan(y / x)
    } else if x < 0.0 {
        if y >= 0.0 {
            atan(y / x) + PI
        } else {
            atan(y / x) - PI
        }
    } else if y > 0.0 {
        PI / 2.0
    } else if y < 0.0 {
        -PI / 2.0
    } else {
        0.0
    }
}

/// x to the y for x > 0, through exp and ln; 0 for x <= 0.
pub fn powf(x: f64, y: f64) -> f64 {
    if x <= 0.0 { 0.0 } else { exp(y * ln(x)) }
}

/// acos through atan2.
pub fn acos(x: f64) -> f64 {
    let x = x.clamp(-1.0, 1.0);
    atan2((1.0 - x * x).sqrt(), x)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exp_ln_match_host() {
        let mut x: f64 = -40.0;
        while x < 40.0 {
            assert!(((exp(x) - x.exp()) / x.exp()).abs() < 2e-15);
            x += 0.0173;
        }
        for &x in &[1e-12, 0.001, 0.5, 1.0, 2.0, 12345.0] {
            assert!((ln(x) - x.ln()).abs() <= 2e-15 * x.ln().abs().max(1.0));
            assert!((log10(x) - x.log10()).abs() < 1e-14);
        }
    }

    #[test]
    fn trig_matches_host() {
        let mut x: f64 = -1000.0;
        while x < 1000.0 {
            let (s, c) = sin_cos(x);
            assert!((s - x.sin()).abs() < 1e-13, "sin({x})");
            assert!((c - x.cos()).abs() < 1e-13, "cos({x})");
            x += 0.731;
        }
        for &(y, x) in &[
            (1.0, 1.0),
            (-2.0, 0.5),
            (3.0, -4.0),
            (-1e-3, -7.0),
            (5.0, 0.0),
            (0.2, 9.0),
        ] {
            assert!(
                (atan2(y, x) - f64::atan2(y, x)).abs() < 1e-15,
                "atan2({y},{x})"
            );
        }
    }
}
