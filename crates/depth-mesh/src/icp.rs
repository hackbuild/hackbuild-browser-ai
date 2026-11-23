//! Point to plane ICP against a voxel model (as earlier builds did):
//! the model keeps one averaged point and normal per voxel; each iteration
//! finds the nearest model point in the 27 neighbour voxels, keeps pairs
//! whose normals agree and whose plane distance is under the stage limit,
//! solves the 6 by 6 normal equations, and composes a small rotation. Two
//! stages, coarse at twice the distance then fine; the best error wins.
//! The voxel map is ordered, so native and wasm builds walk it the same way.

use crate::math::{acos, sin_cos};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Default)]
pub struct Rec {
    pub p: [f64; 3],
    pub n: [f64; 3],
    pub w: f64,
}

pub struct Model {
    pub voxel: f64,
    pub cap: usize,
    pub map: BTreeMap<(i64, i64, i64), Rec>,
}

pub type Pose = ([f64; 9], [f64; 3]);

pub const IDENTITY: Pose = ([1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], [0.0; 3]);

fn apply(r: &[f64; 9], t: &[f64; 3], p: [f64; 3]) -> [f64; 3] {
    [
        r[0] * p[0] + r[1] * p[1] + r[2] * p[2] + t[0],
        r[3] * p[0] + r[4] * p[1] + r[5] * p[2] + t[1],
        r[6] * p[0] + r[7] * p[1] + r[8] * p[2] + t[2],
    ]
}

fn rot(r: &[f64; 9], p: [f64; 3]) -> [f64; 3] {
    apply(r, &[0.0; 3], p)
}

pub fn rodrigues(w: [f64; 3]) -> [f64; 9] {
    let th = (w[0] * w[0] + w[1] * w[1] + w[2] * w[2]).sqrt();
    if th < 1e-12 {
        return IDENTITY.0;
    }
    let (x, y, z) = (w[0] / th, w[1] / th, w[2] / th);
    let (s, c) = sin_cos(th);
    let k = 1.0 - c;
    [
        c + x * x * k,
        x * y * k - z * s,
        x * z * k + y * s,
        y * x * k + z * s,
        c + y * y * k,
        y * z * k - x * s,
        z * x * k - y * s,
        z * y * k + x * s,
        c + z * z * k,
    ]
}

pub fn matmul3(a: &[f64; 9], b: &[f64; 9]) -> [f64; 9] {
    let mut c = [0f64; 9];
    for i in 0..3 {
        for j in 0..3 {
            let mut s = 0.0;
            for k in 0..3 {
                s += a[i * 3 + k] * b[k * 3 + j];
            }
            c[i * 3 + j] = s;
        }
    }
    c
}

/// Gaussian elimination with partial pivoting; zero pivots give zero.
pub fn solve6(a: &[f64; 36], b: &[f64; 6]) -> [f64; 6] {
    let (mut m, mut bb) = (*a, *b);
    let mut x = [0f64; 6];
    for col in 0..6 {
        let mut piv = col;
        let mut mx = m[col * 6 + col].abs();
        for r in col + 1..6 {
            if m[r * 6 + col].abs() > mx {
                mx = m[r * 6 + col].abs();
                piv = r;
            }
        }
        if piv != col {
            for c in 0..6 {
                m.swap(col * 6 + c, piv * 6 + c);
            }
            bb.swap(col, piv);
        }
        let d = m[col * 6 + col];
        if d.abs() < 1e-12 {
            continue;
        }
        for r in col + 1..6 {
            let f = m[r * 6 + col] / d;
            if f == 0.0 {
                continue;
            }
            for c in col..6 {
                m[r * 6 + c] -= f * m[col * 6 + c];
            }
            bb[r] -= f * bb[col];
        }
    }
    for r in (0..6).rev() {
        let mut s = bb[r];
        for c in r + 1..6 {
            s -= m[r * 6 + c] * x[c];
        }
        let d = m[r * 6 + r];
        x[r] = if d.abs() < 1e-12 { 0.0 } else { s / d };
    }
    x
}

/// Rotation angle between two rotations, radians.
pub fn rot_angle(a: &[f64; 9], b: &[f64; 9]) -> f64 {
    let tr: f64 = (0..9).map(|e| a[e] * b[e]).sum();
    acos((tr - 1.0) / 2.0)
}

impl Model {
    pub fn new(voxel: f64, cap: usize) -> Model {
        Model {
            voxel,
            cap,
            map: BTreeMap::new(),
        }
    }

    fn key(&self, p: [f64; 3]) -> (i64, i64, i64) {
        (
            (p[0] / self.voxel).floor() as i64,
            (p[1] / self.voxel).floor() as i64,
            (p[2] / self.voxel).floor() as i64,
        )
    }

    /// Fold a camera space cloud into the model at a pose.
    pub fn integrate(&mut self, pos: &[f32], nor: &[f32], pose: &Pose) {
        for i in 0..pos.len() / 3 {
            let p = apply(
                &pose.0,
                &pose.1,
                [
                    pos[i * 3] as f64,
                    pos[i * 3 + 1] as f64,
                    pos[i * 3 + 2] as f64,
                ],
            );
            let n = rot(
                &pose.0,
                [
                    nor[i * 3] as f64,
                    nor[i * 3 + 1] as f64,
                    nor[i * 3 + 2] as f64,
                ],
            );
            let k = self.key(p);
            let len = self.map.len();
            match self.map.get_mut(&k) {
                None => {
                    if len < self.cap {
                        self.map.insert(k, Rec { p, n, w: 1.0 });
                    }
                }
                Some(r) => {
                    let (w, w1) = (r.w, r.w + 1.0);
                    for a in 0..3 {
                        r.p[a] = (r.p[a] * w + p[a]) / w1;
                        r.n[a] += n[a];
                    }
                    let nl = (r.n[0] * r.n[0] + r.n[1] * r.n[1] + r.n[2] * r.n[2]).sqrt();
                    let nl = if nl > 0.0 { nl } else { 1.0 };
                    for a in 0..3 {
                        r.n[a] /= nl;
                    }
                    r.w = w1;
                }
            }
        }
    }

    fn nearest(&self, p: [f64; 3], max_d: f64) -> Option<&Rec> {
        let (ix, iy, iz) = self.key(p);
        let mut best = None;
        let mut bd = max_d * max_d;
        for dz in -1..=1 {
            for dy in -1..=1 {
                for dx in -1..=1 {
                    if let Some(r) = self.map.get(&(ix + dx, iy + dy, iz + dz)) {
                        let d = (r.p[0] - p[0]).powi(2)
                            + (r.p[1] - p[1]).powi(2)
                            + (r.p[2] - p[2]).powi(2);
                        if d < bd {
                            bd = d;
                            best = Some(r);
                        }
                    }
                }
            }
        }
        best
    }

    /// Refine `pose` for a camera space cloud. Returns (pose, inliers, rms error).
    pub fn icp(
        &self,
        pos: &[f32],
        nor: &[f32],
        start: &Pose,
        step: usize,
        iters: usize,
        max_d: f64,
        norm_t: f64,
    ) -> (Pose, usize, f64) {
        let n = pos.len() / 3;
        let (mut r, mut t) = *start;
        let (mut best_r, mut best_t, mut best_err, mut best_inl) = (r, t, 1e30, 0usize);
        for md in [max_d * 2.0, max_d] {
            for _ in 0..iters {
                let mut a = [0f64; 36];
                let mut g = [0f64; 6];
                let (mut inl, mut es) = (0usize, 0f64);
                let mut i = 0;
                while i < n {
                    let w = apply(
                        &r,
                        &t,
                        [
                            pos[i * 3] as f64,
                            pos[i * 3 + 1] as f64,
                            pos[i * 3 + 2] as f64,
                        ],
                    );
                    let nw = rot(
                        &r,
                        [
                            nor[i * 3] as f64,
                            nor[i * 3 + 1] as f64,
                            nor[i * 3 + 2] as f64,
                        ],
                    );
                    i += step.max(1);
                    let Some(q) = self.nearest(w, md) else {
                        continue;
                    };
                    if q.n[0] * nw[0] + q.n[1] * nw[1] + q.n[2] * nw[2] < norm_t {
                        continue;
                    }
                    let res = (w[0] - q.p[0]) * q.n[0]
                        + (w[1] - q.p[1]) * q.n[1]
                        + (w[2] - q.p[2]) * q.n[2];
                    if res.abs() > md {
                        continue;
                    }
                    let row = [
                        w[1] * q.n[2] - w[2] * q.n[1],
                        w[2] * q.n[0] - w[0] * q.n[2],
                        w[0] * q.n[1] - w[1] * q.n[0],
                        q.n[0],
                        q.n[1],
                        q.n[2],
                    ];
                    for r0 in 0..6 {
                        g[r0] -= row[r0] * res;
                        for c0 in 0..6 {
                            a[r0 * 6 + c0] += row[r0] * row[c0];
                        }
                    }
                    inl += 1;
                    es += res * res;
                }
                if inl < 10 {
                    break;
                }
                let err = (es / inl as f64).sqrt();
                if err < best_err {
                    (best_err, best_inl, best_r, best_t) = (err, inl, r, t);
                }
                for d in 0..6 {
                    a[d * 6 + d] += 1e-6;
                }
                let x = solve6(&a, &g);
                let dr = rodrigues([x[0], x[1], x[2]]);
                r = matmul3(&dr, &r);
                let tt = rot(&dr, t);
                t = [tt[0] + x[3], tt[1] + x[4], tt[2] + x[5]];
            }
            r = best_r;
            t = best_t;
        }
        ((best_r, best_t), best_inl, best_err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovers_a_small_motion() {
        // a bumpy surface so all six degrees of freedom are constrained
        let (mut pos, mut nor) = (Vec::new(), Vec::new());
        for j in 0..40 {
            for i in 0..40 {
                let (x, y) = (i as f64 * 0.01 - 0.2, j as f64 * 0.01 - 0.2);
                let (sx, cx) = sin_cos(x * 15.0);
                let (sy, cy) = sin_cos(y * 11.0);
                let z = -0.5 + 0.03 * sx * cy;
                let (gx, gy) = (0.03 * 15.0 * cx * cy, -0.03 * 11.0 * sx * sy);
                let l = (gx * gx + gy * gy + 1.0).sqrt();
                pos.extend_from_slice(&[x as f32, y as f32, z as f32]);
                nor.extend_from_slice(&[(-gx / l) as f32, (-gy / l) as f32, (1.0 / l) as f32]);
            }
        }
        let mut m = Model::new(0.008, 1_000_000);
        m.integrate(&pos, &nor, &IDENTITY);
        let truth = (rodrigues([0.0, 0.02, 0.01]), [0.004, -0.003, 0.002]);
        let inv_r = [
            truth.0[0], truth.0[3], truth.0[6], truth.0[1], truth.0[4], truth.0[7], truth.0[2],
            truth.0[5], truth.0[8],
        ];
        let it = rot(&inv_r, truth.1);
        let inv_t = [-it[0], -it[1], -it[2]];
        let (mut p2, mut n2) = (Vec::new(), Vec::new());
        for i in 0..pos.len() / 3 {
            let p = apply(
                &inv_r,
                &inv_t,
                [
                    pos[i * 3] as f64,
                    pos[i * 3 + 1] as f64,
                    pos[i * 3 + 2] as f64,
                ],
            );
            let n = rot(
                &inv_r,
                [
                    nor[i * 3] as f64,
                    nor[i * 3 + 1] as f64,
                    nor[i * 3 + 2] as f64,
                ],
            );
            p2.extend(p.iter().map(|&v| v as f32));
            n2.extend(n.iter().map(|&v| v as f32));
        }
        let (pose, inl, err) = m.icp(&p2, &n2, &IDENTITY, 1, 20, 0.02, 0.5);
        assert!(inl > 500 && err < 0.003, "{inl} {err}");
        assert!(rot_angle(&pose.0, &truth.0) < 0.01);
        assert!((pose.1[0] - truth.1[0]).abs() < 0.003);
    }
}
