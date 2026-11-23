//! Biquads (RBJ cookbook, as the earlier transcription tool and its August build wrote them), the
//! the earlier transcription tool dc blocker and the lookahead limiter. Filter state is kept in f64
//! and each output sample is stored as f32, as the JS builds did.

use crate::math::{PI, exp, sin_cos};

/// b0, b1, b2, a1, a2, normalized by a0.
pub type Coef = [f64; 5];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Highpass,
    Lowpass,
    /// Band pass, constant skirt gain.
    Bandpass,
}

pub fn coef(kind: Kind, fc: f64, fs: f64, q: f64) -> Coef {
    let w = 2.0 * PI * fc / fs;
    let (sw, cw) = sin_cos(w);
    let al = sw / (2.0 * q);
    let a0 = 1.0 + al;
    let (b0, b1, b2) = match kind {
        Kind::Highpass => ((1.0 + cw) / 2.0, -(1.0 + cw), (1.0 + cw) / 2.0),
        Kind::Lowpass => ((1.0 - cw) / 2.0, 1.0 - cw, (1.0 - cw) / 2.0),
        Kind::Bandpass => (al, 0.0, -al),
    };
    [b0 / a0, b1 / a0, b2 / a0, (-2.0 * cw) / a0, (1.0 - al) / a0]
}

pub fn biquad(x: &[f32], c: &Coef, out: &mut [f32]) {
    let [b0, b1, b2, a1, a2] = *c;
    let (mut x1, mut x2, mut y1, mut y2) = (0f64, 0f64, 0f64, 0f64);
    for (i, &v) in x.iter().enumerate() {
        let x0 = v as f64;
        let y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;
        out[i] = y0 as f32;
    }
}

/// One pole dc blocker, pole at 0.9975 (as earlier builds did).
pub fn dc_block(x: &[f32], out: &mut [f32]) {
    let (mut px, mut py) = (0f64, 0f64);
    for (i, &v) in x.iter().enumerate() {
        let v = v as f64;
        py = v - px + 0.9975 * py;
        px = v;
        out[i] = py as f32;
    }
}

/// Lookahead peak limiter: 4 ms blocks, two blocks of lookahead, 120 ms
/// release, hard clip at the ceiling (the earlier transcription tool, ceiling 0.891). In place.
pub fn limit(x: &mut [f32], ceil: f64, sr: f64) {
    let b = ((0.004 * sr + 0.5).floor() as usize).max(1);
    let rel = exp(-1.0 / (0.12 * sr));
    let nb = x.len().div_ceil(b);
    let mut bm = vec![0f32; nb + 2];
    for k in 0..nb {
        let e = x.len().min((k + 1) * b);
        let mut m = 0f32;
        for &v in &x[k * b..e] {
            let a = v.abs();
            if a > m {
                m = a;
            }
        }
        bm[k] = m;
    }
    let mut g = 1f64;
    for i in 0..x.len() {
        let k = i / b;
        let pk = bm[k].max(bm[k + 1]).max(bm[k + 2]) as f64;
        let t = if pk > ceil { ceil / pk } else { 1.0 };
        g = if t < g { t } else { t + (g - t) * rel };
        let mut v = x[i] as f64 * g;
        if v > ceil {
            v = ceil;
        } else if v < -ceil {
            v = -ceil;
        }
        x[i] = v as f32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn highpass_kills_dc_and_limiter_caps() {
        let x = vec![1.0f32; 4000];
        let mut y = vec![0f32; 4000];
        biquad(&x, &coef(Kind::Highpass, 80.0, 16000.0, 0.707), &mut y);
        assert!(y[3999].abs() < 1e-3);
        dc_block(&x, &mut y);
        assert!(y[3999].abs() < 1e-3);
        let mut z: Vec<f32> = (0..1600)
            .map(|i| if i % 2 == 0 { 2.0 } else { -2.0 })
            .collect();
        limit(&mut z, 0.891, 16000.0);
        assert!(z.iter().all(|v| v.abs() <= 0.891 + 1e-6));
    }
}
