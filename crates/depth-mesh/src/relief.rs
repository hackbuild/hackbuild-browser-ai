//! Relief heightfields (BAIL): depth or brightness to heights in mm with a
//! base, a top height, a background cut and a gamma; the 2D pinch heal;
//! and the closed heightfield solid (top follows the field, flat bottom,
//! walls on the outline, each top quad split on its shorter diagonal).

use crate::math::powf;

#[derive(Clone, Copy, Debug)]
pub struct ReliefParams {
    /// Lowest relief height, mm.
    pub base: f64,
    /// Highest relief height, mm.
    pub height: f64,
    pub gamma: f64,
    /// Fraction of the value range cut away as background, 0 to 0.98.
    pub bgcut: f64,
    pub invert: bool,
}

/// Heights in mm, 0 where there is no relief. `mask` (optional, nonzero
/// is inside) limits the region; values are normalized over the region.
pub fn heights(v: &[f32], mask: Option<&[u8]>, p: &ReliefParams) -> Vec<f32> {
    let n = v.len();
    let inside = |i: usize| mask.is_none_or(|m| m[i] != 0);
    let val = |i: usize| {
        if p.invert {
            1.0 - v[i] as f64
        } else {
            v[i] as f64
        }
    };
    let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
    for i in 0..n {
        if inside(i) {
            lo = lo.min(val(i));
            hi = hi.max(val(i));
        }
    }
    let mut out = vec![0f32; n];
    if hi.partial_cmp(&lo) != Some(core::cmp::Ordering::Greater) {
        return out;
    }
    for i in 0..n {
        if !inside(i) {
            continue;
        }
        let mut x = (val(i) - lo) / (hi - lo);
        x = (x - p.bgcut) / (1.0 - p.bgcut).max(0.02);
        if x <= 0.0 {
            continue;
        }
        let t = powf(x.min(1.0), p.gamma);
        out[i] = (p.base + (p.height - p.base).max(0.0) * t).max(0.12) as f32;
    }
    out
}

/// Fill one cell per corner to corner pinch so the outline is manifold. Returns the fills.
pub fn heal_pinches(h: &mut [f32], w: usize, ht: usize) -> usize {
    let mut n = 0;
    let mut changed = true;
    while changed {
        changed = false;
        for j in 0..ht.saturating_sub(1) {
            for i in 0..w.saturating_sub(1) {
                let (a, b) = (j * w + i, j * w + i + 1);
                let (c, d) = (a + w, b + w);
                let (ia, ib, ic, id) = (h[a] > 0.0, h[b] > 0.0, h[c] > 0.0, h[d] > 0.0);
                if ia && id && !ib && !ic {
                    h[b] = h[a].min(h[d]);
                    changed = true;
                    n += 1;
                } else if ib && ic && !ia && !id {
                    h[a] = h[b].min(h[c]);
                    changed = true;
                    n += 1;
                }
            }
        }
    }
    n
}

pub struct Mesh {
    pub positions: Vec<f32>,
    pub indices: Vec<u32>,
}

/// Closed solid over the cells with h > 0, cell size px, origin (x0, y0), sitting on z0.
pub fn heightfield_mesh(
    h: &[f32],
    w: usize,
    ht: usize,
    px: f64,
    x0: f64,
    y0: f64,
    z0: f64,
) -> Mesh {
    let cw = w + 1;
    let inside = |i: i64, j: i64| {
        i >= 0
            && j >= 0
            && (i as usize) < w
            && (j as usize) < ht
            && h[j as usize * w + i as usize] > 0.0
    };
    let mut top = vec![-1i64; (w + 1) * (ht + 1)];
    let mut bot = vec![-1i64; (w + 1) * (ht + 1)];
    let mut pos: Vec<f64> = Vec::new();
    let mut idx: Vec<u32> = Vec::new();
    let corner_h = |ci: i64, cj: i64| {
        let (mut s, mut n) = (0f64, 0);
        for (i, j) in [(ci - 1, cj - 1), (ci, cj - 1), (ci - 1, cj), (ci, cj)] {
            if inside(i, j) {
                s += h[j as usize * w + i as usize] as f64;
                n += 1;
            }
        }
        if n > 0 { s / n as f64 } else { 0.0 }
    };
    let vert = |ids: &mut Vec<i64>, pos: &mut Vec<f64>, ci: usize, cj: usize, z: f64| -> u32 {
        let k = cj * cw + ci;
        if ids[k] < 0 {
            ids[k] = (pos.len() / 3) as i64;
            pos.extend_from_slice(&[x0 + ci as f64 * px, y0 + cj as f64 * px, z]);
        }
        ids[k] as u32
    };
    for j in 0..ht {
        for i in 0..w {
            if h[j * w + i] <= 0.0 {
                continue;
            }
            let c = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)];
            let t: Vec<u32> = c
                .iter()
                .map(|&(a, b)| vert(&mut top, &mut pos, a, b, z0 + corner_h(a as i64, b as i64)))
                .collect();
            let b: Vec<u32> = c
                .iter()
                .map(|&(a, bb)| vert(&mut bot, &mut pos, a, bb, z0))
                .collect();
            let hz = |v: u32| pos[v as usize * 3 + 2];
            if (hz(t[0]) - hz(t[2])).abs() <= (hz(t[1]) - hz(t[3])).abs() {
                idx.extend_from_slice(&[t[0], t[1], t[2], t[0], t[2], t[3]]);
            } else {
                idx.extend_from_slice(&[t[0], t[1], t[3], t[1], t[2], t[3]]);
            }
            idx.extend_from_slice(&[b[0], b[2], b[1], b[0], b[3], b[2]]);
            let (ii, jj) = (i as i64, j as i64);
            let mut quad =
                |q: [u32; 4]| idx.extend_from_slice(&[q[0], q[1], q[2], q[0], q[2], q[3]]);
            if !inside(ii, jj - 1) {
                quad([t[1], t[0], b[0], b[1]]);
            }
            if !inside(ii + 1, jj) {
                quad([t[2], t[1], b[1], b[2]]);
            }
            if !inside(ii, jj + 1) {
                quad([t[3], t[2], b[2], b[3]]);
            }
            if !inside(ii - 1, jj) {
                quad([t[0], t[3], b[3], b[0]]);
            }
        }
    }
    Mesh {
        positions: pos.iter().map(|&v| v as f32).collect(),
        indices: idx,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heights_cut_and_mesh_closes() {
        let v: Vec<f32> = (0..16).map(|i| i as f32 / 15.0).collect();
        let p = ReliefParams {
            base: 0.4,
            height: 2.4,
            gamma: 1.0,
            bgcut: 0.2,
            invert: false,
        };
        let h = heights(&v, None, &p);
        assert_eq!(h[0], 0.0);
        assert!((h[15] - 2.4).abs() < 1e-6);
        let m = heightfield_mesh(&[1.0; 4], 2, 2, 1.0, 0.0, 0.0, 0.0);
        // 4 top and 4 bottom cells' triangles plus 8 wall quads
        assert_eq!(m.indices.len() / 3, 4 * 2 + 4 * 2 + 8 * 2);
        let mut pinch = vec![1.0, 0.0, 0.0, 1.0];
        assert_eq!(heal_pinches(&mut pinch, 2, 2), 1);
    }
}
