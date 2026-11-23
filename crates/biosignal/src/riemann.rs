//! Symmetric positive definite matrices (as earlier builds did): cyclic Jacobi eigen
//! decomposition, matrix functions through it (log, exp, inverse square
//! root), shrunk covariances, the log-Euclidean mean as the tangent space
//! reference, and tangent vectors (upper triangle, off diagonals times
//! sqrt 2). Matrices are row major n by n f64.

use crate::math::{exp, ln};

pub fn jacobi(a_in: &[f64], n: usize) -> (Vec<f64>, Vec<f64>) {
    let mut a = a_in.to_vec();
    let mut v = vec![0f64; n * n];
    for i in 0..n {
        v[i * n + i] = 1.0;
    }
    for _ in 0..80 {
        let mut off = 0.0;
        for p in 0..n {
            for q in p + 1..n {
                off += a[p * n + q] * a[p * n + q];
            }
        }
        if off < 1e-28 {
            break;
        }
        for p in 0..n {
            for q in p + 1..n {
                let apq = a[p * n + q];
                if apq.abs() < 1e-300 {
                    continue;
                }
                let theta = (a[q * n + q] - a[p * n + p]) / (2.0 * apq);
                let t = (if theta >= 0.0 { 1.0 } else { -1.0 })
                    / (theta.abs() + (theta * theta + 1.0).sqrt());
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..n {
                    let (akp, akq) = (a[k * n + p], a[k * n + q]);
                    a[k * n + p] = c * akp - s * akq;
                    a[k * n + q] = s * akp + c * akq;
                }
                for k in 0..n {
                    let (apk, aqk) = (a[p * n + k], a[q * n + k]);
                    a[p * n + k] = c * apk - s * aqk;
                    a[q * n + k] = s * apk + c * aqk;
                }
                for k in 0..n {
                    let (vkp, vkq) = (v[k * n + p], v[k * n + q]);
                    v[k * n + p] = c * vkp - s * vkq;
                    v[k * n + q] = s * vkp + c * vkq;
                }
            }
        }
    }
    ((0..n).map(|i| a[i * n + i]).collect(), v)
}

pub fn mat_fun(a: &[f64], n: usize, f: impl Fn(f64) -> f64) -> Vec<f64> {
    let (d, v) = jacobi(a, n);
    let fd: Vec<f64> = d.iter().map(|&x| f(x)).collect();
    let mut out = vec![0f64; n * n];
    for i in 0..n {
        for j in i..n {
            let mut s = 0.0;
            for k in 0..n {
                s += v[i * n + k] * fd[k] * v[j * n + k];
            }
            out[i * n + j] = s;
            out[j * n + i] = s;
        }
    }
    out
}

const EPSD: f64 = 1e-10;
pub fn logm(a: &[f64], n: usize) -> Vec<f64> {
    mat_fun(a, n, |x| ln(x.max(EPSD)))
}
pub fn expm(a: &[f64], n: usize) -> Vec<f64> {
    mat_fun(a, n, exp)
}
pub fn invsqrtm(a: &[f64], n: usize) -> Vec<f64> {
    mat_fun(a, n, |x| 1.0 / x.max(EPSD).sqrt())
}

pub fn matmul(a: &[f64], b: &[f64], n: usize) -> Vec<f64> {
    let mut c = vec![0f64; n * n];
    for i in 0..n {
        for k in 0..n {
            let x = a[i * n + k];
            if x == 0.0 {
                continue;
            }
            for j in 0..n {
                c[i * n + j] += x * b[k * n + j];
            }
        }
    }
    c
}

/// Covariance of c channels by t samples (row major), shrunk toward its mean eigenvalue.
pub fn covariance(x: &[f32], c: usize, t: usize, shrink: f64) -> Vec<f64> {
    let mu: Vec<f64> = (0..c)
        .map(|ch| {
            x[ch * t..(ch + 1) * t]
                .iter()
                .map(|&v| v as f64)
                .sum::<f64>()
                / t as f64
        })
        .collect();
    let mut s = vec![0f64; c * c];
    for i in 0..c {
        for j in i..c {
            let mut acc = 0.0;
            for k in 0..t {
                acc += (x[i * t + k] as f64 - mu[i]) * (x[j * t + k] as f64 - mu[j]);
            }
            acc /= (t - 1).max(1) as f64;
            s[i * c + j] = acc;
            s[j * c + i] = acc;
        }
    }
    let tr: f64 = (0..c).map(|i| s[i * c + i]).sum();
    let m = if tr != 0.0 { tr / c as f64 } else { 1e-6 };
    for i in 0..c {
        for j in 0..c {
            s[i * c + j] = (1.0 - shrink) * s[i * c + j] + if i == j { shrink * m } else { 0.0 };
        }
    }
    s
}

/// exp(mean(log Ci)).
pub fn ref_mean(covs: &[&[f64]], n: usize) -> Vec<f64> {
    let mut acc = vec![0f64; n * n];
    for c in covs {
        for (a, l) in acc.iter_mut().zip(logm(c, n)) {
            *a += l;
        }
    }
    for a in &mut acc {
        *a /= covs.len().max(1) as f64;
    }
    expm(&acc, n)
}

/// Tangent vector of C at the reference whose inverse square root is p.
pub fn tangent(c: &[f64], p: &[f64], n: usize) -> Vec<f64> {
    let l = logm(&matmul(&matmul(p, c, n), p, n), n);
    let mut out = Vec::with_capacity(n * (n + 1) / 2);
    for i in 0..n {
        out.push(l[i * n + i]);
        for j in i + 1..n {
            out.push(core::f64::consts::SQRT_2 * l[i * n + j]);
        }
    }
    out
}

/// Affine invariant distance: Frobenius norm of log(A^-1/2 B A^-1/2).
pub fn distance(a: &[f64], b: &[f64], n: usize) -> f64 {
    let p = invsqrtm(a, n);
    let (d, _) = jacobi(&matmul(&matmul(&p, b, n), &p, n), n);
    d.iter()
        .map(|&x| ln(x.max(EPSD)).powi(2))
        .sum::<f64>()
        .sqrt()
}
