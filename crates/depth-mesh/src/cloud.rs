//! Depth to a camera space point cloud with normals (an earlier scan bench
//! buildCurrentCloud). Depth is 0 to 1 with larger nearer, as Depth
//! Anything gives it; Z = near + (1 - d) (far - near), the camera looks
//! down -Z, y up. Normals come from the four grid neighbours and face the
//! camera; points on depth edges (a z step over a quarter of the range)
//! are dropped as fliers.

#[derive(Clone, Copy, Debug)]
pub struct CloudParams {
    pub near: f64,
    pub far: f64,
    /// Focal length in pixels of this depth map.
    pub focal: f64,
    pub stride: usize,
    /// Keep depths in [dmin, dmax].
    pub dmin: f64,
    pub dmax: f64,
}

pub fn backproject(u: f64, v: f64, d01: f64, w: usize, h: usize, p: &CloudParams) -> [f64; 3] {
    let z = p.near + (1.0 - d01) * (p.far - p.near);
    let (cx, cy) = (w as f64 / 2.0, h as f64 / 2.0);
    [(u - cx) * z / p.focal, -(v - cy) * z / p.focal, -z]
}

/// Positions and unit normals, three f32 each per point.
pub fn build_cloud(depth: &[f32], w: usize, h: usize, p: &CloudParams) -> (Vec<f32>, Vec<f32>) {
    let st = p.stride.max(1);
    let gw = (w - 1) / st + 1;
    let gh = (h - 1) / st + 1;
    let mut gpos = vec![0f64; gw * gh * 3];
    let mut gval = vec![false; gw * gh];
    for gy in 0..gh {
        for gx in 0..gw {
            let (u, v) = (gx * st, gy * st);
            let d = (depth[v * w + u] as f64).clamp(0.0, 1.0);
            if d < p.dmin || d > p.dmax {
                continue;
            }
            let q = backproject(u as f64, v as f64, d, w, h, p);
            let i = gy * gw + gx;
            gpos[i * 3..i * 3 + 3].copy_from_slice(&q);
            gval[i] = true;
        }
    }
    let gap = (p.far - p.near) * 0.25;
    let (mut pos, mut nor) = (Vec::new(), Vec::new());
    for gy in 1..gh.saturating_sub(1) {
        for gx in 1..gw.saturating_sub(1) {
            let c = gy * gw + gx;
            let (l, r, dn, up) = (c - 1, c + 1, c - gw, c + gw);
            if !(gval[c] && gval[l] && gval[r] && gval[dn] && gval[up]) {
                continue;
            }
            let a = [
                gpos[r * 3] - gpos[l * 3],
                gpos[r * 3 + 1] - gpos[l * 3 + 1],
                gpos[r * 3 + 2] - gpos[l * 3 + 2],
            ];
            let b = [
                gpos[up * 3] - gpos[dn * 3],
                gpos[up * 3 + 1] - gpos[dn * 3 + 1],
                gpos[up * 3 + 2] - gpos[dn * 3 + 2],
            ];
            if a[2].abs().max(b[2].abs()) > gap {
                continue;
            }
            let mut n = [
                a[1] * b[2] - a[2] * b[1],
                a[2] * b[0] - a[0] * b[2],
                a[0] * b[1] - a[1] * b[0],
            ];
            let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
            if len < 1e-9 {
                continue;
            }
            for k in &mut n {
                *k /= len;
            }
            if n[2] < 0.0 {
                n = [-n[0], -n[1], -n[2]];
            }
            for k in 0..3 {
                pos.push(gpos[c * 3 + k] as f32);
                nor.push(n[k] as f32);
            }
        }
    }
    (pos, nor)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flat_plane_faces_camera() {
        let d = vec![0.5f32; 32 * 32];
        let p = CloudParams {
            near: 0.2,
            far: 1.0,
            focal: 30.0,
            stride: 2,
            dmin: 0.0,
            dmax: 1.0,
        };
        let (pos, nor) = build_cloud(&d, 32, 32, &p);
        assert_eq!(pos.len(), 14 * 14 * 3);
        assert!((pos[2] + 0.6).abs() < 1e-6);
        assert!((nor[2] - 1.0).abs() < 1e-6);
    }
}
