//! Onsets, tempo and grid fit (SCRIBE August): positive difference of an
//! RMS envelope as novelty, peak picking over a local mean, autocorrelation
//! tempo over 60 to 200 bpm with a phase search, and a vector strength fit
//! of onset times over 55 to 208 bpm.

use crate::math::{PI, atan2, ln, sin_cos};

const LN2: f64 = core::f64::consts::LN_2;

pub fn novelty(env: &[f32]) -> Vec<f32> {
    let mut nov = vec![0f32; env.len()];
    for i in 1..env.len() {
        nov[i] = (env[i] - env[i - 1]).max(0.0);
    }
    nov
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Onset {
    /// Frame of the attack foot.
    pub frame: usize,
    pub peak: usize,
    pub strength: f32,
}

/// Peaks of novelty above gate * max and above 1.6 * sens times the mean
/// of a 0.35 s window, at least min_gap seconds apart (the stronger peak
/// wins), each walked back down its rise by up to 30 ms.
pub fn pick_onsets(env: &[f32], fps: f64, min_gap: f64, sens: f64, gate: f64) -> Vec<Onset> {
    let n = env.len();
    let nov = novelty(env);
    let nov_max = nov.iter().copied().fold(0f32, f32::max) as f64;
    let floor = nov_max * if gate > 0.0 { gate } else { 0.1 };
    let win = ((fps * 0.35 + 0.5).floor() as usize).max(4);
    let gap_frames = min_gap * fps;
    let max_back = (0.03 * fps + 0.5).floor() as usize;
    let mut hits: Vec<Onset> = Vec::new();
    let mut last: f64 = -1e9;
    if n < 3 {
        return hits;
    }
    for i in 2..n - 1 {
        let v = nov[i] as f64;
        if v < floor || nov[i] <= nov[i - 1] || nov[i] < nov[i + 1] {
            continue;
        }
        let (a, b) = (i.saturating_sub(win), n.min(i + win));
        let sum: f64 = nov[a..b].iter().map(|&x| x as f64).sum();
        let mean = sum / ((b - a).max(1)) as f64;
        if v < mean * (1.6 * sens) + 1e-5 {
            continue;
        }
        if (i as f64) - last < gap_frames {
            if let Some(h) = hits.last_mut()
                && nov[i] > h.strength
            {
                *h = Onset {
                    frame: i,
                    peak: i,
                    strength: nov[i],
                };
                last = i as f64;
            }
            continue;
        }
        let mut f = i;
        let foot = env[i] * 0.2;
        for _ in 0..max_back {
            if f > 1 && env[f - 1] < env[f] && env[f] > foot {
                f -= 1;
            } else {
                break;
            }
        }
        hits.push(Onset {
            frame: f,
            peak: i,
            strength: nov[i],
        });
        last = i as f64;
    }
    hits
}

fn log2(x: f64) -> f64 {
    ln(x) / LN2
}

/// (bpm, offset seconds) from an RMS envelope at fps frames per second.
pub fn estimate_tempo(env: &[f32], fps: f64) -> (f64, f64) {
    let n = env.len();
    let mut nov: Vec<f64> = novelty(env).iter().map(|&v| v as f64).collect();
    let mean = nov.iter().sum::<f64>() / n.max(1) as f64;
    for v in &mut nov {
        *v = ((*v - mean) as f32) as f64;
    }
    let (mut best_bpm, mut best_score) = (120.0, -1.0);
    let mut step = 0;
    while step <= 560 {
        let bpm = 60.0 + step as f64 * 0.25;
        step += 1;
        let lag = (fps * 60.0 / bpm + 0.5).floor() as usize;
        if lag < 2 || lag >= n {
            continue;
        }
        let mut s = 0f64;
        for i in 0..n - lag {
            s += nov[i] * nov[i + lag];
        }
        s /= (n - lag) as f64;
        s *= 1.0 - log2(bpm / 120.0).abs() * 0.35;
        if s > best_score {
            best_score = s;
            best_bpm = bpm;
        }
    }
    let p = 60.0 / best_bpm;
    let (mut best_off, mut best) = (0.0, -1.0);
    for st in 0..96 {
        let o = st as f64 / 96.0 * p;
        let mut score = 0f64;
        let mut t = o;
        while t * fps < (n as f64) - 1.0 {
            let f = t * fps;
            let i0 = f.floor() as usize;
            let fr = f - i0 as f64;
            score += nov[i0] * (1.0 - fr) + nov[i0 + 1] * fr;
            t += p;
        }
        if score > best {
            best = score;
            best_off = o;
        }
    }
    (best_bpm, best_off)
}

/// (bpm, offset seconds in -half beat to half beat, R) by vector strength;
/// None when the weights sum to zero.
pub fn fit_grid(times: &[f64], weights: &[f64]) -> Option<(f64, f64, f64)> {
    let tot: f64 = weights.iter().sum();
    if tot == 0.0 {
        return None;
    }
    let (mut bb, mut br, mut bp) = (120.0, -1.0, 0.0);
    let mut step = 0;
    while step <= 3060 {
        let bpm = 55.0 + step as f64 * 0.05;
        step += 1;
        let w = 2.0 * PI * bpm / 60.0;
        let (mut sx, mut sy) = (0f64, 0f64);
        for (t, v) in times.iter().zip(weights) {
            let (s, c) = sin_cos(w * t);
            sx += c * v;
            sy += s * v;
        }
        let mut r = (sx * sx + sy * sy).sqrt() / tot;
        r *= 1.0 - log2(bpm / 120.0).abs() * 0.12;
        if r > br {
            br = r;
            bb = bpm;
            bp = atan2(sy, sx);
        }
    }
    let spb = 60.0 / bb;
    let mut off = bp / (2.0 * PI) * spb;
    off = ((off % spb) + spb) % spb;
    if off > spb / 2.0 {
        off -= spb;
    }
    Some((bb, off, br))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clicks(bpm: f64, fps: f64, secs: f64) -> Vec<f32> {
        let n = (fps * secs) as usize;
        let mut env = vec![0.01f32; n];
        let mut t = 0.25;
        while t < secs {
            let i = (t * fps) as usize;
            for k in 0..4 {
                if i + k < n {
                    env[i + k] = 1.0 - k as f32 * 0.2;
                }
            }
            t += 60.0 / bpm;
        }
        env
    }

    #[test]
    fn tempo_onsets_grid() {
        let fps = 11025.0 / 128.0;
        let env = clicks(120.0, fps, 12.0);
        let (bpm, _) = estimate_tempo(&env, fps);
        assert!((bpm - 120.0).abs() < 2.0, "{bpm}");
        let hits = pick_onsets(&env, fps, 0.05, 1.0, 0.1);
        assert!(hits.len() >= 22 && hits.len() <= 24, "{}", hits.len());
        let times: Vec<f64> = (0..20).map(|i| 0.1 + i as f64 * 0.5).collect();
        let (b, off, r) = fit_grid(&times, &[1.0; 20]).unwrap();
        assert!((b - 120.0).abs() < 0.06 && r > 0.9, "{b} {r}");
        assert!((off - 0.1).abs() < 0.01, "{off}");
        assert!(fit_grid(&[], &[]).is_none());
    }
}
