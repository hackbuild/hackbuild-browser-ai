//! Spectral subtraction from a noise print (as earlier builds did): a median
//! magnitude spectrum of up to 320 quiet frames, then a gain per bin of
//! max(floor, 1 - alpha N / |X|), smoothed over time (0.55 old, 0.45 new)
//! and across neighbour bins (0.25, 0.5, 0.25), resynthesized by sqrt Hann
//! overlap add.

use crate::fft::{Fft, sqrt_hann};

/// Median magnitude per bin over frames whose level is under floor + 4 dB.
/// `db` holds one level per `frame_hop` samples. None when no frame fits.
pub fn noise_spectrum(
    sig: &[f32],
    db: &[f32],
    floor_db: f32,
    w: usize,
    frame_hop: usize,
) -> Option<Vec<f32>> {
    let bins = w / 2 + 1;
    let fits = |i: usize| i * frame_hop + w < sig.len();
    let mut idx: Vec<usize> = (0..db.len())
        .filter(|&i| db[i] < floor_db + 4.0 && fits(i))
        .collect();
    if idx.len() < 8 {
        idx.extend((0..db.len()).filter(|&i| fits(i)));
    }
    if idx.is_empty() {
        return None;
    }
    let take = idx.len().min(320);
    let step = idx.len() as f64 / take as f64;
    let win = sqrt_hann(w);
    let fft = Fft::new(w);
    let (mut re, mut im) = (vec![0f32; w], vec![0f32; w]);
    let mut cols = vec![0f32; take * bins];
    for k in 0..take {
        let o = idx[(k as f64 * step).floor() as usize] * frame_hop;
        for i in 0..w {
            re[i] = sig[o + i] * win[i];
            im[i] = 0.0;
        }
        fft.run(&mut re, &mut im, false);
        for b in 0..bins {
            let (r, m) = (re[b] as f64, im[b] as f64);
            cols[k * bins + b] = (r * r + m * m).sqrt() as f32;
        }
    }
    let mut n = vec![0f32; bins];
    let mut tmp = vec![0f32; take];
    for b in 0..bins {
        for k in 0..take {
            tmp[k] = cols[k * bins + b];
        }
        tmp.sort_by(f32::total_cmp);
        n[b] = tmp[take / 2];
    }
    Some(n)
}

/// Subtract the noise print from x. Output has x's length.
pub fn denoise(x: &[f32], noise: &[f32], alpha: f64, g_floor: f64, w: usize, h: usize) -> Vec<f32> {
    let bins = w / 2 + 1;
    let win = sqrt_hann(w);
    let fft = Fft::new(w);
    let nf = (x.len() + h + w).div_ceil(h);
    let mut pad = vec![0f32; nf * h + w];
    pad[h..h + x.len()].copy_from_slice(x);
    let mut acc = vec![0f32; pad.len()];
    let (mut re, mut im) = (vec![0f32; w], vec![0f32; w]);
    let mut g = vec![0f32; bins];
    let mut gs = vec![0f32; bins];
    let mut gp = vec![1f32; bins];
    for f in 0..nf {
        let o = f * h;
        for i in 0..w {
            re[i] = pad[o + i] * win[i];
            im[i] = 0.0;
        }
        fft.run(&mut re, &mut im, false);
        for b in 0..bins {
            let (r, m) = (re[b] as f64, im[b] as f64);
            let mag = (r * r + m * m).sqrt();
            let gain = if mag > 1e-10 {
                g_floor.max(1.0 - alpha * noise[b] as f64 / mag)
            } else {
                g_floor
            };
            g[b] = (0.55 * gp[b] as f64 + 0.45 * gain) as f32;
        }
        for b in 0..bins {
            let l = g[b.saturating_sub(1)] as f64;
            let r = g[(b + 1).min(bins - 1)] as f64;
            gs[b] = (0.25 * l + 0.5 * g[b] as f64 + 0.25 * r) as f32;
        }
        for b in 0..bins {
            gp[b] = gs[b];
            re[b] = (re[b] as f64 * gs[b] as f64) as f32;
            im[b] = (im[b] as f64 * gs[b] as f64) as f32;
            if b > 0 && b < w / 2 {
                re[w - b] = re[b];
                im[w - b] = -im[b];
            }
        }
        fft.run(&mut re, &mut im, true);
        for i in 0..w {
            acc[o + i] = (acc[o + i] as f64 + re[i] as f64 * win[i] as f64) as f32;
        }
    }
    acc[h..h + x.len()].to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_alpha_reconstructs() {
        let x: Vec<f32> = (0..4000)
            .map(|i| crate::math::sin(i as f64 * 0.05) as f32 * 0.3)
            .collect();
        let n = vec![0f32; 257];
        let y = denoise(&x, &n, 0.0, 1.0, 512, 256);
        for i in 600..3400 {
            assert!((y[i] - x[i]).abs() < 1e-4, "{i}");
        }
    }
}
