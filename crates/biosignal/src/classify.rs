//! The COLLET classifier: per band covariances to tangent vectors at the
//! training set's log-Euclidean mean, then multinomial logistic regression
//! (standardized features, Adam, L2). Cross validation folds by trial, so
//! windows cut from one trial never sit on both sides of a split, and the
//! reference is fitted on the training fold only (no leak).

use crate::math::{exp, sin_cos};
use crate::riemann::{invsqrtm, ref_mean, tangent};

pub struct LogReg {
    pub w: Vec<f64>,
    pub b: Vec<f64>,
    pub mu: Vec<f64>,
    pub sd: Vec<f64>,
    pub k: usize,
    pub d: usize,
}

fn softmax(p: &mut [f64]) {
    let mx = p.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let mut sum = 0.0;
    for v in p.iter_mut() {
        *v = exp(*v - mx);
        sum += *v;
    }
    for v in p.iter_mut() {
        *v /= sum;
    }
}

impl LogReg {
    pub fn fit(x: &[Vec<f64>], y: &[usize], k: usize, l2: f64, epochs: usize, lr: f64) -> LogReg {
        let (n, d) = (x.len(), x[0].len());
        let mut mu = vec![0f64; d];
        let mut sd = vec![0f64; d];
        for j in 0..d {
            mu[j] = x.iter().map(|r| r[j]).sum::<f64>() / n as f64;
            let v = x.iter().map(|r| (r[j] - mu[j]).powi(2)).sum::<f64>() / n as f64;
            sd[j] = if v > 0.0 { v.sqrt() } else { 1.0 };
        }
        let z: Vec<Vec<f64>> = x
            .iter()
            .map(|r| (0..d).map(|j| (r[j] - mu[j]) / sd[j]).collect())
            .collect();
        let (mut w, mut b) = (vec![0f64; k * d], vec![0f64; k]);
        let (mut mw, mut vw, mut mb, mut vb) = (
            vec![0f64; k * d],
            vec![0f64; k * d],
            vec![0f64; k],
            vec![0f64; k],
        );
        let (b1, b2, eps) = (0.9, 0.999, 1e-8);
        let (mut p1, mut p2) = (1.0, 1.0);
        let mut p = vec![0f64; k];
        for _ in 0..epochs {
            let (mut gw, mut gb) = (vec![0f64; k * d], vec![0f64; k]);
            for i in 0..n {
                for c in 0..k {
                    p[c] = b[c] + (0..d).map(|j| w[c * d + j] * z[i][j]).sum::<f64>();
                }
                softmax(&mut p);
                for c in 0..k {
                    let err = p[c] - if y[i] == c { 1.0 } else { 0.0 };
                    gb[c] += err / n as f64;
                    for j in 0..d {
                        gw[c * d + j] += err * z[i][j] / n as f64;
                    }
                }
            }
            for j in 0..k * d {
                gw[j] += l2 * w[j];
            }
            p1 *= b1;
            p2 *= b2;
            let (c1, c2) = (1.0 - p1, 1.0 - p2);
            for j in 0..k * d {
                mw[j] = b1 * mw[j] + (1.0 - b1) * gw[j];
                vw[j] = b2 * vw[j] + (1.0 - b2) * gw[j] * gw[j];
                w[j] -= lr * (mw[j] / c1) / ((vw[j] / c2).sqrt() + eps);
            }
            for c in 0..k {
                mb[c] = b1 * mb[c] + (1.0 - b1) * gb[c];
                vb[c] = b2 * vb[c] + (1.0 - b2) * gb[c] * gb[c];
                b[c] -= lr * (mb[c] / c1) / ((vb[c] / c2).sqrt() + eps);
            }
        }
        LogReg { w, b, mu, sd, k, d }
    }

    pub fn proba(&self, x: &[f64]) -> Vec<f64> {
        let mut p: Vec<f64> = (0..self.k)
            .map(|c| {
                self.b[c]
                    + (0..self.d)
                        .map(|j| self.w[c * self.d + j] * (x[j] - self.mu[j]) / self.sd[j])
                        .sum::<f64>()
            })
            .collect();
        softmax(&mut p);
        p
    }
}

pub struct Params {
    pub l2: f64,
    pub epochs: usize,
    pub lr: f64,
}

pub const DEFAULT: Params = Params {
    l2: 0.05,
    epochs: 150,
    lr: 0.14,
};

/// A trained classifier: one inverse square root reference per band, then logistic regression.
pub struct Model {
    pub c: usize,
    pub bands: usize,
    pub projectors: Vec<Vec<f64>>,
    pub reg: LogReg,
}

/// `covs[i][band]` is a c by c matrix.
pub fn features(covs: &[Vec<f64>], projectors: &[Vec<f64>], c: usize) -> Vec<f64> {
    covs.iter()
        .zip(projectors)
        .flat_map(|(cv, p)| tangent(cv, p, c))
        .collect()
}

pub fn fit(covs: &[Vec<Vec<f64>>], y: &[usize], k: usize, c: usize, p: &Params) -> Model {
    let bands = covs[0].len();
    let projectors: Vec<Vec<f64>> = (0..bands)
        .map(|b| {
            let list: Vec<&[f64]> = covs.iter().map(|e| e[b].as_slice()).collect();
            invsqrtm(&ref_mean(&list, c), c)
        })
        .collect();
    let x: Vec<Vec<f64>> = covs.iter().map(|e| features(e, &projectors, c)).collect();
    Model {
        c,
        bands,
        reg: LogReg::fit(&x, y, k, p.l2, p.epochs, p.lr),
        projectors,
    }
}

impl Model {
    pub fn proba(&self, covs: &[Vec<f64>]) -> Vec<f64> {
        self.reg.proba(&features(covs, &self.projectors, self.c))
    }
    pub fn predict(&self, covs: &[Vec<f64>]) -> usize {
        let p = self.proba(covs);
        (0..p.len()).fold(0, |b, i| if p[i] > p[b] { i } else { b })
    }
}

/// mulberry32 for the fold shuffle.
struct Rng(u32);
impl Rng {
    fn next_f64(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b_79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
}

/// Fold index per window: whole trials go to one fold (by_trial), or windows are shuffled one by one.
pub fn folds(trials: &[u32], k: usize, by_trial: bool, seed: u32) -> Vec<usize> {
    let mut r = Rng(seed);
    let units: Vec<u32> = if by_trial {
        let mut u: Vec<u32> = trials.to_vec();
        u.sort_unstable();
        u.dedup();
        u
    } else {
        (0..trials.len() as u32).collect()
    };
    let mut order = units.clone();
    for i in (1..order.len()).rev() {
        let j = (r.next_f64() * (i + 1) as f64) as usize;
        order.swap(i, j);
    }
    let fold_of = |u: u32| order.iter().position(|&x| x == u).unwrap() % k;
    (0..trials.len())
        .map(|i| {
            if by_trial {
                fold_of(trials[i])
            } else {
                fold_of(i as u32)
            }
        })
        .collect()
}

/// Accuracy per fold; the reference and the regression are fitted on each training fold only.
pub fn cross_validate(
    covs: &[Vec<Vec<f64>>],
    y: &[usize],
    trials: &[u32],
    k: usize,
    c: usize,
    nfolds: usize,
    by_trial: bool,
    seed: u32,
    p: &Params,
) -> Vec<f64> {
    let f = folds(trials, nfolds, by_trial, seed);
    (0..nfolds)
        .map(|fi| {
            let tr: Vec<usize> = (0..y.len()).filter(|&i| f[i] != fi).collect();
            let te: Vec<usize> = (0..y.len()).filter(|&i| f[i] == fi).collect();
            if tr.is_empty() || te.is_empty() {
                return f64::NAN;
            }
            let m = fit(
                &tr.iter().map(|&i| covs[i].clone()).collect::<Vec<_>>(),
                &tr.iter().map(|&i| y[i]).collect::<Vec<_>>(),
                k,
                c,
                p,
            );
            te.iter().filter(|&&i| m.predict(&covs[i]) == y[i]).count() as f64 / te.len() as f64
        })
        .collect()
}

/// A seeded two class fixture: c channel windows where class 1 adds a
/// rhythm on channel 0 at `hz`; `trials` trials of `per` windows each.
pub fn synth_epochs(
    seed: u32,
    c: usize,
    t: usize,
    fs: f64,
    hz: f64,
    trials: usize,
    per: usize,
) -> (Vec<f32>, Vec<usize>, Vec<u32>) {
    let mut r = Rng(seed);
    let mut x = Vec::with_capacity(trials * per * c * t);
    let (mut y, mut tr) = (Vec::new(), Vec::new());
    for ti in 0..trials {
        let cls = ti % 2;
        for _ in 0..per {
            let ph = r.next_f64() * core::f64::consts::TAU;
            for ch in 0..c {
                for k in 0..t {
                    let mut v = r.next_f64() * 2.0 - 1.0;
                    if cls == 1 && ch == 0 {
                        v += 1.5 * sin_cos(2.0 * crate::math::PI * hz * k as f64 / fs + ph).0;
                    }
                    if ch > 0 {
                        v += 0.3 * (r.next_f64() * 2.0 - 1.0);
                    }
                    x.push(v as f32);
                }
            }
            y.push(cls);
            tr.push(ti as u32);
        }
    }
    (x, y, tr)
}
