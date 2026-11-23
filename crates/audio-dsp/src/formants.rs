//! Formant estimation by linear prediction: the vowel resonances of a
//! voiced sound. Ported from bellowsjs `packages/bellows/src/analysis/
//! formants.ts` `estimateFormants` (MIT, by the same owner as this
//! repository), with the same steps and defaults: decimate by `decim`
//! through a windowed sinc low pass, pre-emphasis 0.97, a Hamming window of
//! `win_sec`, autocorrelation and Levinson-Durbin of `order`, then the roots
//! of the predictor polynomial by Durand-Kerner. The trigonometry goes
//! through `crate::math` so native and wasm32 give the same bits.
//!
//! Buffers are held in `Formants` and reused, so a caller that measures
//! many frames allocates once.

use crate::math::{PI, atan2, cos, ln, sin};

/// One resonance: centre frequency and bandwidth, Hz.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Formant {
    pub f: f64,
    pub bw: f64,
}

/// Reusable work buffers for `estimate`.
#[derive(Default)]
pub struct Formants {
    h: Vec<f64>,
    y: Vec<f64>,
    r: Vec<f64>,
    a: Vec<f64>,
    prev: Vec<f64>,
    c: Vec<f64>,
    zr: Vec<f64>,
    zi: Vec<f64>,
    /// The last estimate, ascending by frequency.
    pub out: Vec<Formant>,
}

impl Formants {
    pub fn new() -> Self {
        Self::default()
    }

    /// Formants of `x` around sample index `center`. Poles wider than 700 Hz
    /// and outside 90 Hz to 100 Hz under the decimated Nyquist are dropped.
    /// The bellows defaults suit an adult voice at 44.1 or 48 kHz:
    /// `win_sec` 0.04, `decim` 4, `order` 14. Returns the count.
    pub fn estimate(
        &mut self,
        x: &[f32],
        sr: f64,
        center: usize,
        win_sec: f64,
        decim: usize,
        order: usize,
    ) -> usize {
        self.out.clear();
        let decim = decim.max(1);
        let order = order.max(1);
        let half = (win_sec * sr / 2.0).round() as i64;
        let a0 = (center as i64 - half).max(0);
        let b0 = (center as i64 + half).min(x.len() as i64);
        let taps = 16 * decim + 1;
        let fc = 0.45 / decim as f64;
        let mid = (taps - 1) as f64 / 2.0;
        self.h.clear();
        let mut hs = 0.0;
        for i in 0..taps {
            let t = i as f64 - mid;
            let s = if t == 0.0 {
                2.0 * fc
            } else {
                sin(2.0 * PI * fc * t) / (PI * t)
            };
            let v = s * (0.54 - 0.46 * cos(2.0 * PI * i as f64 / (taps - 1) as f64));
            self.h.push(v);
            hs += v;
        }
        if b0 <= a0 {
            return 0;
        }
        let n = ((b0 - a0) as usize) / decim;
        if n < order * 3 {
            return 0;
        }
        let off = (taps as i64 - 1) / 2;
        self.y.clear();
        for i in 0..n {
            let mut s = 0.0;
            for k in 0..taps {
                let j = a0 + (i * decim + k) as i64 - off;
                if j >= 0 && j < x.len() as i64 {
                    s += (self.h[k] / hs) * x[j as usize] as f64;
                }
            }
            self.y.push(s);
        }
        // pre-emphasis and Hamming window, in place from the end so y[i - 1] is still raw
        for i in (0..n).rev() {
            let prev = if i > 0 { self.y[i - 1] } else { 0.0 };
            let w = 0.54 - 0.46 * cos(2.0 * PI * i as f64 / (n - 1) as f64);
            self.y[i] = (self.y[i] - 0.97 * prev) * w;
        }
        let z = &self.y;
        self.r.clear();
        self.r.resize(order + 1, 0.0);
        for k in 0..=order {
            let mut s = 0.0;
            for i in k..n {
                s += z[i] * z[i - k];
            }
            self.r[k] = s;
        }
        if self.r[0] <= 0.0 {
            return 0;
        }
        self.r[0] *= 1.0 + 1e-9;
        self.a.clear();
        self.a.resize(order + 1, 0.0);
        self.a[0] = 1.0;
        let mut e = self.r[0];
        for i in 1..=order {
            let mut acc = self.r[i];
            for j in 1..i {
                acc += self.a[j] * self.r[i - j];
            }
            let k = -acc / e;
            self.prev.clear();
            self.prev.extend_from_slice(&self.a);
            for j in 1..i {
                self.a[j] = self.prev[j] + k * self.prev[i - j];
            }
            self.a[i] = k;
            e *= 1.0 - k * k;
        }
        // roots of z^p + a1 z^(p-1) + ... + ap
        self.c.clear();
        self.c.resize(order + 1, 0.0);
        for j in 0..=order {
            self.c[order - j] = self.a[j];
        }
        self.zr.clear();
        self.zi.clear();
        for k in 0..order {
            let ang = 2.0 * PI * k as f64 / order as f64 + 0.4;
            self.zr.push(0.9 * cos(ang));
            self.zi.push(0.9 * sin(ang));
        }
        let c = &self.c;
        for _ in 0..500 {
            let mut mv: f64 = 0.0;
            for k in 0..order {
                let (xr, xi) = (self.zr[k], self.zi[k]);
                let mut pr = c[order];
                let mut pi = 0.0;
                for j in (0..order).rev() {
                    let tr = pr * xr - pi * xi + c[j];
                    pi = pr * xi + pi * xr;
                    pr = tr;
                }
                let mut dr = c[order];
                let mut di = 0.0;
                for j in 0..order {
                    if j == k {
                        continue;
                    }
                    let ar = xr - self.zr[j];
                    let ai = xi - self.zi[j];
                    let tr = dr * ar - di * ai;
                    di = dr * ai + di * ar;
                    dr = tr;
                }
                let mut den = dr * dr + di * di;
                if den == 0.0 {
                    den = 1e-300;
                }
                let qr = (pr * dr + pi * di) / den;
                let qi = (pi * dr - pr * di) / den;
                self.zr[k] -= qr;
                self.zi[k] -= qi;
                mv = mv.max(qr.abs() + qi.abs());
            }
            if mv < 1e-12 {
                break;
            }
        }
        let fs = sr / decim as f64;
        for k in 0..order {
            let (xr, xi) = (self.zr[k], self.zi[k]);
            if xi <= 0.0 {
                continue;
            }
            let f = atan2(xi, xr) * fs / (2.0 * PI);
            let bw = -ln((xr * xr + xi * xi).sqrt()) * fs / PI;
            if f > 90.0 && f < fs / 2.0 - 100.0 && bw < 700.0 {
                self.out.push(Formant { f, bw });
            }
        }
        self.out.sort_by(|p, q| p.f.total_cmp(&q.f));
        self.out.len()
    }
}

/// A test vowel: an impulse train at `f0` through two pole resonators at
/// `formants` (Hz, bandwidth Hz), summed in cascade. Deterministic.
pub fn vowel(n: usize, sr: f64, f0: f64, formants: &[(f64, f64)], out: &mut [f32]) {
    let mut sig = vec![0f64; n];
    let period = sr / f0;
    let mut next = 0.0;
    for (i, s) in sig.iter_mut().enumerate() {
        if i as f64 >= next {
            *s = 1.0;
            next += period;
        }
    }
    for &(f, bw) in formants {
        let r = crate::math::exp(-PI * bw / sr);
        let a1 = 2.0 * r * cos(2.0 * PI * f / sr);
        let a2 = -r * r;
        let (mut y1, mut y2) = (0.0, 0.0);
        for s in sig.iter_mut() {
            let y = *s + a1 * y1 + a2 * y2;
            y2 = y1;
            y1 = y;
            *s = y;
        }
    }
    let peak = sig.iter().fold(0f64, |m, v| m.max(v.abs())).max(1e-12);
    for (o, s) in out.iter_mut().zip(sig.iter()) {
        *o = (s / peak * 0.5) as f32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_formants_of_a_synthetic_vowel() {
        let sr = 48000.0;
        let n = 9600;
        let mut x = vec![0f32; n];
        vowel(
            n,
            sr,
            120.0,
            &[(730.0, 90.0), (1090.0, 110.0), (2440.0, 170.0)],
            &mut x,
        );
        let mut f = Formants::new();
        let k = f.estimate(&x, sr, n / 2, 0.04, 4, 14);
        assert!(k >= 3, "{:?}", f.out);
        let near = |hz: f64| f.out.iter().any(|p| (p.f - hz).abs() < hz * 0.05);
        assert!(near(730.0) && near(1090.0) && near(2440.0), "{:?}", f.out);
    }

    #[test]
    fn short_or_silent_input_gives_none() {
        let mut f = Formants::new();
        assert_eq!(f.estimate(&[0.0; 4000], 48000.0, 2000, 0.04, 4, 14), 0);
        assert_eq!(f.estimate(&[0.1; 50], 48000.0, 25, 0.04, 4, 14), 0);
        assert_eq!(f.estimate(&[], 48000.0, 0, 0.04, 4, 14), 0);
    }
}
