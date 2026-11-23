//! Zero phase band pass (as earlier builds did): a high pass and a low pass biquad
//! (Butterworth Q), run forward then backward, and an optional notch with
//! its first harmonic (Q 30).

use crate::math::{PI, sin_cos};

#[derive(Clone, Copy)]
struct Bq {
    b: [f64; 3],
    a: [f64; 2],
    z: [f64; 2],
}

impl Bq {
    fn new(kind: u8, f: f64, fs: f64, q: f64) -> Bq {
        let (s, c) = sin_cos(2.0 * PI * f / fs);
        let al = s / (2.0 * q);
        let a0 = 1.0 + al;
        let b = match kind {
            0 => [(1.0 + c) / 2.0, -(1.0 + c), (1.0 + c) / 2.0],
            1 => [(1.0 - c) / 2.0, 1.0 - c, (1.0 - c) / 2.0],
            _ => [1.0, -2.0 * c, 1.0],
        };
        Bq {
            b: [b[0] / a0, b[1] / a0, b[2] / a0],
            a: [(-2.0 * c) / a0, (1.0 - al) / a0],
            z: [0.0; 2],
        }
    }
    /// Transposed direct form II.
    fn step(&mut self, x: f64) -> f64 {
        let y = self.b[0] * x + self.z[0];
        self.z[0] = self.b[1] * x - self.a[0] * y + self.z[1];
        self.z[1] = self.b[2] * x - self.a[1] * y;
        y
    }
}

fn chain(lo: f64, hi: f64, notch: f64, fs: f64) -> Vec<Bq> {
    let q = core::f64::consts::FRAC_1_SQRT_2;
    let mut v = vec![Bq::new(0, lo, fs, q), Bq::new(1, hi, fs, q)];
    if notch > 0.0 {
        v.push(Bq::new(2, notch, fs, 30.0));
        if notch * 2.0 < fs / 2.0 {
            v.push(Bq::new(2, notch * 2.0, fs, 30.0));
        }
    }
    v
}

pub fn bandpass_zero_phase(x: &[f32], fs: f64, lo: f64, hi: f64, notch: f64) -> Vec<f32> {
    let mut f = vec![0f64; x.len()];
    let mut c = chain(lo, hi, notch, fs);
    for (i, &v) in x.iter().enumerate() {
        f[i] = c.iter_mut().fold(v as f64, |a, b| b.step(a));
    }
    let mut c = chain(lo, hi, notch, fs);
    let mut g = vec![0f32; x.len()];
    for i in (0..x.len()).rev() {
        g[i] = c.iter_mut().fold(f[i], |a, b| b.step(a)) as f32;
    }
    g
}
