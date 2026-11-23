//! Radix 2 complex FFT over f32 buffers with f64 arithmetic, the layout of
//! SCRIBE's makeFFT: bit reversal, then butterflies with a cos and sin
//! table. The inverse divides by n.

use crate::math::sin_cos;

pub struct Fft {
    n: usize,
    cs: Vec<f64>,
    sn: Vec<f64>,
    rev: Vec<u32>,
}

impl Fft {
    /// n must be a power of two.
    pub fn new(n: usize) -> Fft {
        assert!(
            n.is_power_of_two() && n >= 2,
            "fft size must be a power of two"
        );
        let levels = n.trailing_zeros();
        let half = n >> 1;
        let mut cs = vec![0.0; half];
        let mut sn = vec![0.0; half];
        for i in 0..half {
            let (s, c) = sin_cos(2.0 * crate::math::PI * i as f64 / n as f64);
            cs[i] = c;
            sn[i] = s;
        }
        let rev = (0..n as u32)
            .map(|i| i.reverse_bits() >> (32 - levels))
            .collect();
        Fft { n, cs, sn, rev }
    }

    pub fn len(&self) -> usize {
        self.n
    }

    pub fn is_empty(&self) -> bool {
        self.n == 0
    }

    pub fn run(&self, re: &mut [f32], im: &mut [f32], inverse: bool) {
        let n = self.n;
        for i in 0..n {
            let j = self.rev[i] as usize;
            if j > i {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let mut size = 2;
        while size <= n {
            let half = size >> 1;
            let step = n / size;
            let mut i = 0;
            while i < n {
                let mut k = 0;
                for j in i..i + half {
                    let c = self.cs[k];
                    let s = if inverse { self.sn[k] } else { -self.sn[k] };
                    let l = j + half;
                    let (rl, il) = (re[l] as f64, im[l] as f64);
                    let tr = rl * c - il * s;
                    let ti = rl * s + il * c;
                    let (rj, ij) = (re[j] as f64, im[j] as f64);
                    re[l] = (rj - tr) as f32;
                    im[l] = (ij - ti) as f32;
                    re[j] = (rj + tr) as f32;
                    im[j] = (ij + ti) as f32;
                    k += step;
                }
                i += size;
            }
            size <<= 1;
        }
        if inverse {
            let nf = n as f64;
            for i in 0..n {
                re[i] = (re[i] as f64 / nf) as f32;
                im[i] = (im[i] as f64 / nf) as f32;
            }
        }
    }
}

/// sqrt of a periodic Hann window, the analysis and synthesis window of the
/// SCRIBE spectral gate (perfect reconstruction at 50 percent overlap).
pub fn sqrt_hann(n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| {
            (0.5 - 0.5 * crate::math::cos(2.0 * crate::math::PI * i as f64 / n as f64)).sqrt()
                as f32
        })
        .collect()
}

pub fn hann(n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| (0.5 - 0.5 * crate::math::cos(2.0 * crate::math::PI * i as f64 / n as f64)) as f32)
        .collect()
}

/// Magnitude frames of a real signal: `frames * (w / 2 + 1)` values, frame
/// f starting at sample f * hop, zero padded past the end, Hann window.
pub fn stft_mag(x: &[f32], w: usize, hop: usize) -> (Vec<f32>, usize) {
    let fft = Fft::new(w);
    let win = hann(w);
    let bins = w / 2 + 1;
    let frames = if x.len() < w {
        1
    } else {
        (x.len() - w) / hop + 1
    };
    let mut out = vec![0f32; frames * bins];
    let (mut re, mut im) = (vec![0f32; w], vec![0f32; w]);
    for f in 0..frames {
        let o = f * hop;
        for i in 0..w {
            re[i] = x.get(o + i).copied().unwrap_or(0.0) * win[i];
            im[i] = 0.0;
        }
        fft.run(&mut re, &mut im, false);
        for b in 0..bins {
            let (r, m) = (re[b] as f64, im[b] as f64);
            out[f * bins + b] = (r * r + m * m).sqrt() as f32;
        }
    }
    (out, frames)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_peak() {
        let n = 64;
        let f = Fft::new(n);
        let x: Vec<f32> = (0..n)
            .map(|i| crate::math::cos(2.0 * crate::math::PI * 5.0 * i as f64 / n as f64) as f32)
            .collect();
        let (mut re, mut im) = (x.clone(), vec![0f32; n]);
        f.run(&mut re, &mut im, false);
        assert!((re[5] - 32.0).abs() < 1e-4 && re[4].abs() < 1e-4);
        f.run(&mut re, &mut im, true);
        for i in 0..n {
            assert!((re[i] - x[i]).abs() < 1e-5);
        }
    }

    #[test]
    fn stft_frames() {
        let x = vec![0.5f32; 1000];
        let (m, frames) = stft_mag(&x, 256, 128);
        assert_eq!(frames, 6);
        assert_eq!(m.len(), 6 * 129);
        assert!(m[0] > m[5]);
    }
}
