//! Sample rate conversion: linear interpolation (SCRIBE August, cheap and
//! fine for onset work), a Hann windowed sinc for speech and model input,
//! and a FIR decimator by an integer factor (KERF used 41 taps at 7 kHz
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
/// cutoff at 0.95 of the lower Nyquist.
pub fn sinc_resample(x: &[f32], src: f64, dst: f64, zeros: usize, out: &mut [f32]) {
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
            let t = k as f64 - p;
            let win = 0.5 + 0.5 * cos(PI * t / half);
            let h = fc * sinc(fc * t) * win;
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
}
