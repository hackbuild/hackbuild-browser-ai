//! Sample rate conversion: linear interpolation (the earlier transcription tool, cheap and
//! fine for onset work), a Hann windowed sinc for speech and model input,
//! and a FIR decimator by an integer factor (an earlier live captioner used 41 taps at 7 kHz
//! to go from 48 kHz to 16 kHz).

use crate::math::{PI, cos, sin};

/// Output length for a conversion: floor(n * dst / src).
pub fn out_len(n: usize, src: f64, dst: f64) -> usize {
    (n as f64 / (src / dst)).floor() as usize
}

pub fn linear(x: &[f32], src: f64, dst: f64, out: &mut [f32]) {
    let ratio = src / dst;
    let last = x.len().saturating_sub(1);
    for (i, o) in out.iter_mut().enumerate() {
        let p = i as f64 * ratio;
        let i0 = (p.floor() as usize).min(last);
        let i1 = (i0 + 1).min(last);
        let f = p - i0 as f64;
        *o = (x[i0] as f64 * (1.0 - f) + x[i1] as f64 * f) as f32;
    }
}

fn sinc(x: f64) -> f64 {
    if x.abs() < 1e-12 {
        1.0
    } else {
        sin(PI * x) / (PI * x)
    }
}

/// Windowed sinc interpolation with `zeros` zero crossings each side and the
/// cutoff at 0.95 of the lower Nyquist. Integer rates whose reduced ratio
/// has at most `MAX_PHASES` output phases use a polyphase table: the kernel
/// for each fractional position is computed once, so a sample costs one
/// multiply add per tap. Other rates evaluate the kernel per tap.
pub fn sinc_resample(x: &[f32], src: f64, dst: f64, zeros: usize, out: &mut [f32]) {
    if let Some((up, down)) = rational(src, dst)
        && up <= MAX_PHASES
    {
        return sinc_polyphase(x, src, dst, zeros, up, down, out);
    }
    sinc_direct(x, src, dst, zeros, out);
}

/// Largest number of output phases the table path takes (one kernel each).
pub const MAX_PHASES: u64 = 4096;

fn gcd(mut a: u64, mut b: u64) -> u64 {
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

/// src / dst as down / up in lowest terms when both rates are whole numbers.
fn rational(src: f64, dst: f64) -> Option<(u64, u64)> {
    let ok = |v: f64| v > 0.0 && v.fract() == 0.0 && v < 1e9;
    if !ok(src) || !ok(dst) {
        return None;
    }
    let (s, d) = (src as u64, dst as u64);
    let g = gcd(s, d);
    Some((d / g, s / g))
}

fn kernel(t: f64, fc: f64, half: f64) -> f64 {
    let win = 0.5 + 0.5 * cos(PI * t / half);
    fc * sinc(fc * t) * win
}

/// Output i sits at input position i * down / up = q + r / up. Phase r has
/// taps at offsets m from ceil(r / up - half) to floor(r / up + half).
fn sinc_polyphase(
    x: &[f32],
    src: f64,
    dst: f64,
    zeros: usize,
    up: u64,
    down: u64,
    out: &mut [f32],
) {
    let fc = 0.95 * (dst / src).min(1.0);
    let half = zeros as f64 / fc;
    let n = x.len() as i64;
    let span = 2 * (half.ceil() as usize) + 2;
    let phases = up as usize;
    let mut table = vec![0f64; phases * span];
    let mut first = vec![0i64; phases];
    let mut count = vec![0usize; phases];
    for r in 0..phases {
        let frac = r as f64 / up as f64;
        let a = (frac - half).ceil() as i64;
        let b = (frac + half).floor() as i64;
        first[r] = a;
        let mut c = 0;
        for m in a..=b {
            if c < span {
                table[r * span + c] = kernel(m as f64 - frac, fc, half);
                c += 1;
            }
        }
        count[r] = c;
    }
    // interior outputs see every tap, so their kernels are normalized once
    let mut norm = table.clone();
    for r in 0..phases {
        let row = &mut norm[r * span..r * span + count[r]];
        let w: f64 = row.iter().sum();
        if w.abs() > 1e-12 {
            for v in row.iter_mut() {
                *v /= w;
            }
        }
    }
    for (i, o) in out.iter_mut().enumerate() {
        let num = i as u64 * down;
        let q = (num / up) as i64;
        let r = (num % up) as usize;
        let k0 = q + first[r];
        let h = &table[r * span..r * span + count[r]];
        let mut s = 0f64;
        let mut wsum = 0f64;
        if k0 >= 0 && k0 + h.len() as i64 <= n {
            let hn = &norm[r * span..r * span + count[r]];
            let xs = &x[k0 as usize..k0 as usize + hn.len()];
            let (mut s0, mut s1) = (0f64, 0f64);
            let mut j = 0;
            while j + 1 < hn.len() {
                s0 += xs[j] as f64 * hn[j];
                s1 += xs[j + 1] as f64 * hn[j + 1];
                j += 2;
            }
            if j < hn.len() {
                s0 += xs[j] as f64 * hn[j];
            }
            *o = (s0 + s1) as f32;
            continue;
        } else {
            for (j, w) in h.iter().enumerate() {
                let k = k0 + j as i64;
                if k >= 0 && k < n {
                    s += x[k as usize] as f64 * w;
                    wsum += w;
                }
            }
        }
        *o = if wsum.abs() > 1e-12 {
            (s / wsum) as f32
        } else {
            0.0
        };
    }
}

/// The kernel evaluated per tap, for rates the table path does not take.
pub fn sinc_direct(x: &[f32], src: f64, dst: f64, zeros: usize, out: &mut [f32]) {
    let ratio = src / dst;
    let fc = 0.95 * (dst / src).min(1.0);
    let half = zeros as f64 / fc;
    let n = x.len() as i64;
    for (i, o) in out.iter_mut().enumerate() {
        let p = i as f64 * ratio;
        let a = (p - half).ceil() as i64;
        let b = (p + half).floor() as i64;
        let mut s = 0f64;
        let mut wsum = 0f64;
        for k in a.max(0)..=b.min(n - 1) {
            let h = kernel(k as f64 - p, fc, half);
            s += x[k as usize] as f64 * h;
            wsum += h;
        }
        *o = if wsum.abs() > 1e-12 {
            (s / wsum) as f32
        } else {
            0.0
        };
    }
}

/// Hann windowed sinc low pass taps, normalized to unit dc gain.
pub fn lowpass_taps(taps: usize, cutoff: f64, sr: f64) -> Vec<f64> {
    let fc = cutoff / sr;
    let m = (taps - 1) as f64 / 2.0;
    let mut h: Vec<f64> = (0..taps)
        .map(|i| {
            let t = i as f64 - m;
            let win = 0.5 - 0.5 * cos(2.0 * PI * i as f64 / (taps - 1) as f64);
            2.0 * fc * sinc(2.0 * fc * t) * win
        })
        .collect();
    let s: f64 = h.iter().sum();
    for v in &mut h {
        *v /= s;
    }
    h
}

/// Low pass then keep every factor-th sample. floor(n / factor) outputs.
pub fn decimate(x: &[f32], factor: usize, taps: &[f64], out: &mut [f32]) {
    let m = taps.len() / 2;
    let n = x.len() as i64;
    for (i, o) in out.iter_mut().enumerate() {
        let c = (i * factor) as i64;
        let mut s = 0f64;
        for (j, h) in taps.iter().enumerate() {
            let k = c + j as i64 - m as i64;
            if k >= 0 && k < n {
                s += x[k as usize] as f64 * h;
            }
        }
        *o = s as f32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rates() {
        let x: Vec<f32> = (0..4800)
            .map(|i| sin(2.0 * PI * 440.0 * i as f64 / 48000.0) as f32)
            .collect();
        let mut y = vec![0f32; out_len(x.len(), 48000.0, 16000.0)];
        assert_eq!(y.len(), 1600);
        sinc_resample(&x, 48000.0, 16000.0, 16, &mut y);
        for (i, v) in y.iter().enumerate().take(1500).skip(100) {
            let want = sin(2.0 * PI * 440.0 * i as f64 / 16000.0) as f32;
            assert!((v - want).abs() < 2e-3, "{i}");
        }
        let taps = lowpass_taps(41, 7000.0, 48000.0);
        let mut d = vec![0f32; 1600];
        decimate(&x, 3, &taps, &mut d);
        assert!((d[800] - y[800]).abs() < 0.05);
        linear(&x, 48000.0, 16000.0, &mut d);
        assert_eq!(d[10], x[30]);
    }

    #[test]
    fn table_matches_the_direct_kernel() {
        let x: Vec<f32> = (0..8000)
            .map(|i| (sin(i as f64 * 0.37) * 0.5 + sin(i as f64 * 0.051) * 0.3) as f32)
            .collect();
        for (src, dst) in [
            (16000.0, 48000.0),
            (48000.0, 16000.0),
            (16000.0, 22050.0),
            (44100.0, 48000.0),
        ] {
            let m = out_len(x.len(), src, dst);
            let mut a = vec![0f32; m];
            let mut b = vec![0f32; m];
            sinc_resample(&x, src, dst, 16, &mut a);
            sinc_direct(&x, src, dst, 16, &mut b);
            let worst = a
                .iter()
                .zip(&b)
                .fold(0f32, |w, (p, q)| w.max((p - q).abs()));
            assert!(worst < 1e-5, "{src} to {dst}: {worst}");
        }
        assert_eq!(rational(16000.0, 22050.0), Some((441, 320)));
        assert_eq!(rational(16000.5, 22050.0), None);
    }
}
