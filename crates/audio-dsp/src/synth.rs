//! A seeded test signal: noise floor, hum, a dc offset and tone bursts in
//! a speech like on and off pattern. Native and wasm builds produce the
//! same samples, so the parity fixture stores only the seed.

use crate::math::{PI, sin};

/// mulberry32, the seeded generator the TS packages use.
pub struct Rng(pub u32);
impl Rng {
    pub fn next_f64(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b_79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
}

pub fn speechlike(seed: u32, n: usize, sr: f64, out: &mut [f32]) {
    let mut r = Rng(seed);
    let burst = (0.6 * sr) as usize;
    let gap = (0.5 * sr) as usize;
    for (i, o) in out.iter_mut().enumerate().take(n) {
        let t = i as f64 / sr;
        let on = (i % (burst + gap)) < burst && i > gap;
        let mut v = 0.002 * (r.next_f64() * 2.0 - 1.0) + 0.001 * sin(2.0 * PI * 50.0 * t) + 0.01;
        if on {
            let f0 = 140.0 + 40.0 * sin(2.0 * PI * 0.7 * t);
            v += 0.08 * sin(2.0 * PI * f0 * t)
                + 0.03 * sin(2.0 * PI * 3.0 * f0 * t)
                + 0.02 * (r.next_f64() * 2.0 - 1.0);
        }
        *o = v as f32;
    }
}
