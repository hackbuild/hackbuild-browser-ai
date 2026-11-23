//! Frame levels, percentiles, the minimum statistics noise floor and
//! envelopes (as earlier builds did).

use crate::math::{log10, sum_sq};

/// Frame count for a signal of n samples: at least one.
pub fn frame_count(n: usize, frame: usize, hop: usize) -> usize {
    if n < frame { 1 } else { (n - frame) / hop + 1 }
}

/// Level of each frame in dB: 10 log10(sum of squares / frame + 1e-12).
pub fn frame_db(sig: &[f32], hop: usize, frame: usize, out: &mut [f32]) {
    for (i, o) in out.iter_mut().enumerate() {
        let a = (i * hop).min(sig.len());
        let e = sig.len().min(i * hop + frame);
        let s = sum_sq(&sig[a..e]);
        *o = (10.0 * log10(s / frame as f64 + 1e-12)) as f32;
    }
}

fn sorted(x: &[f32]) -> Vec<f32> {
    let mut s = x.to_vec();
    s.sort_by(f32::total_cmp);
    s
}

/// The q quantile by rounded index; -90 for an empty input (as earlier builds did).
pub fn percentile(x: &[f32], q: f64) -> f32 {
    if x.is_empty() {
        return -90.0;
    }
    let s = sorted(x);
    let i = (q * (s.len() - 1) as f64 + 0.5).floor().max(0.0) as usize;
    s[i.min(s.len() - 1)]
}

/// Median of the minima of windows of `win` frames (150 frames, 1.5 s at a
/// 10 ms hop); -80 when there are no frames.
pub fn noise_floor(db: &[f32], win: usize) -> f32 {
    let mut mins: Vec<f32> = db
        .chunks(win.max(1))
        .map(|c| c.iter().copied().fold(f32::INFINITY, f32::min))
        .filter(|m| m.is_finite())
        .collect();
    if mins.is_empty() {
        return -80.0;
    }
    mins.sort_by(f32::total_cmp);
    mins[mins.len() >> 1]
}

/// Peak of |x| in n equal spans, for drawing a waveform rail.
pub fn envelope_peak(sig: &[f32], out: &mut [f32]) {
    let n = out.len();
    let step = sig.len() as f64 / n.max(1) as f64;
    for (i, o) in out.iter_mut().enumerate() {
        let a = (i as f64 * step).floor() as usize;
        let b = sig.len().min(((i + 1) as f64 * step).floor() as usize);
        *o = sig[a.min(b)..b].iter().fold(0f32, |m, v| m.max(v.abs()));
    }
}

/// RMS per hop of samples; floor(len / hop) values.
pub fn envelope_rms(sig: &[f32], hop: usize, out: &mut [f32]) {
    for (i, o) in out.iter_mut().enumerate() {
        let s = sum_sq(&sig[i * hop..(i + 1) * hop]);
        *o = (s / hop as f64).sqrt() as f32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn floor_and_percentile() {
        let db: Vec<f32> = (0..300)
            .map(|i| if i % 50 == 0 { -70.0 } else { -20.0 })
            .collect();
        assert_eq!(noise_floor(&db, 150), -70.0);
        assert_eq!(percentile(&[3.0, 1.0, 2.0], 0.5), 2.0);
        assert_eq!(percentile(&[], 0.5), -90.0);
        let mut out = vec![0f32; 2];
        frame_db(&[0.1; 800], 160, 400, &mut out);
        assert!((out[0] + 20.0).abs() < 1e-4);
    }
}
