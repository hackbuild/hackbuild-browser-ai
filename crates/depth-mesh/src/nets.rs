//! Naive surface nets over a scalar field (inside where the value is above
//! zero), watertight by construction, and the separable 3 tap box blur
//! CALIPER ran before meshing (CALIPER surfaceNets and blurPass).

/// In place blur along x, then y, then z; edges average the taps they have.
pub fn blur_pass(f: &mut [f32], dx: usize, dy: usize, dz: usize) {
    let id = |x: usize, y: usize, z: usize| x + dx * (y + dy * z);
    let mut a = vec![0f32; f.len()];
    let mut b = vec![0f32; f.len()];
    for z in 0..dz {
        for y in 0..dy {
            for x in 0..dx {
                let (mut s, mut c) = (f[id(x, y, z)] as f64, 1.0);
                if x > 0 {
                    s += f[id(x - 1, y, z)] as f64;
                    c += 1.0;
                }
                if x + 1 < dx {
                    s += f[id(x + 1, y, z)] as f64;
                    c += 1.0;
                }
                a[id(x, y, z)] = (s / c) as f32;
            }
        }
    }
    for z in 0..dz {
        for y in 0..dy {
            for x in 0..dx {
                let (mut s, mut c) = (a[id(x, y, z)] as f64, 1.0);
                if y > 0 {
                    s += a[id(x, y - 1, z)] as f64;
                    c += 1.0;
                }
                if y + 1 < dy {
                    s += a[id(x, y + 1, z)] as f64;
                    c += 1.0;
                }
                b[id(x, y, z)] = (s / c) as f32;
            }
        }
    }
    for z in 0..dz {
        for y in 0..dy {
            for x in 0..dx {
                let (mut s, mut c) = (b[id(x, y, z)] as f64, 1.0);
                if z > 0 {
                    s += b[id(x, y, z - 1)] as f64;
                    c += 1.0;
                }
                if z + 1 < dz {
                    s += b[id(x, y, z + 1)] as f64;
                    c += 1.0;
                }
                f[id(x, y, z)] = (s / c) as f32;
            }
        }
    }
}

const CL: [[usize; 3]; 8] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
];
const E: [[usize; 2]; 12] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
];

/// Vertices in grid coordinates (three f32 each) and triangle indices.
pub fn surface_nets(field: &[f32], dx: usize, dy: usize, dz: usize) -> (Vec<f32>, Vec<u32>) {
    let id = |x: usize, y: usize, z: usize| x + dx * (y + dy * z);
    let r = [1usize, dx, dx * dy];
    let mut vindex = vec![-1i64; dx * dy * dz];
    let mut verts: Vec<f32> = Vec::new();
    let mut g = [0f64; 8];
    for z in 0..dz - 1 {
        for y in 0..dy - 1 {
            for x in 0..dx - 1 {
                let mut mask = 0u32;
                for c in 0..8 {
                    let v = field[id(x + CL[c][0], y + CL[c][1], z + CL[c][2])] as f64;
                    g[c] = v;
                    if v > 0.0 {
                        mask |= 1 << c;
                    }
                }
                if mask == 0 || mask == 255 {
                    continue;
                }
                let (mut s, mut cnt) = ([0f64; 3], 0.0);
                for e in E {
                    let (c0, c1) = (e[0], e[1]);
                    if ((mask >> c0) & 1) == ((mask >> c1) & 1) {
                        continue;
                    }
                    let t = g[c0] / (g[c0] - g[c1]);
                    for k in 0..3 {
                        s[k] += CL[c0][k] as f64 + t * (CL[c1][k] as f64 - CL[c0][k] as f64);
                    }
                    cnt += 1.0;
                }
                vindex[id(x, y, z)] = (verts.len() / 3) as i64;
                verts.extend_from_slice(&[
                    (x as f64 + s[0] / cnt) as f32,
                    (y as f64 + s[1] / cnt) as f32,
                    (z as f64 + s[2] / cnt) as f32,
                ]);
            }
        }
    }
    let mut tris: Vec<u32> = Vec::new();
    for z in 1..dz - 1 {
        for y in 1..dy - 1 {
            for x in 1..dx - 1 {
                let m = id(x, y, z);
                if vindex[m] < 0 {
                    continue;
                }
                let f0 = field[m] > 0.0;
                for i in 0..3 {
                    let ac = m + r[i];
                    if (field[ac] > 0.0) == f0 {
                        continue;
                    }
                    let (du, dv) = (r[(i + 1) % 3], r[(i + 2) % 3]);
                    let (v0, v1, v2, v3) = (
                        vindex[m],
                        vindex[m - du],
                        vindex[m - dv],
                        vindex[m - du - dv],
                    );
                    if v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0 {
                        continue;
                    }
                    let (v0, v1, v2, v3) = (v0 as u32, v1 as u32, v2 as u32, v3 as u32);
                    // counter clockwise seen from outside, so the signed volume is positive
                    if f0 {
                        tris.extend_from_slice(&[v0, v3, v2, v0, v1, v3]);
                    } else {
                        tris.extend_from_slice(&[v0, v3, v1, v0, v2, v3]);
                    }
                }
            }
        }
    }
    (verts, tris)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn sphere_is_closed() {
        let d = 20;
        let mut f = vec![0f32; d * d * d];
        for z in 0..d {
            for y in 0..d {
                for x in 0..d {
                    let q = |a: usize| a as f32 - 9.5;
                    f[x + d * (y + d * z)] = 6.0 - (q(x) * q(x) + q(y) * q(y) + q(z) * q(z)).sqrt();
                }
            }
        }
        blur_pass(&mut f, d, d, d);
        let (v, t) = surface_nets(&f, d, d, d);
        assert!(t.len() > 300);
        // signed volume by the divergence theorem: positive when faces point out
        let p = |i: u32| {
            let i = i as usize * 3;
            [v[i] as f64, v[i + 1] as f64, v[i + 2] as f64]
        };
        let mut vol = 0.0;
        for c in t.chunks(3) {
            let (a, b, e) = (p(c[0]), p(c[1]), p(c[2]));
            vol += (a[0] * (b[1] * e[2] - b[2] * e[1]) - a[1] * (b[0] * e[2] - b[2] * e[0])
                + a[2] * (b[0] * e[1] - b[1] * e[0]))
                / 6.0;
        }
        let ball = 4.0 / 3.0 * core::f64::consts::PI * 216.0;
        assert!(
            vol > 0.8 * ball && vol < 1.2 * ball,
            "signed volume {vol} against {ball}"
        );
        let mut edges: HashMap<(u32, u32), i32> = HashMap::new();
        for c in t.chunks(3) {
            for k in 0..3 {
                let (a, b) = (c[k], c[(k + 1) % 3]);
                *edges.entry((a.min(b), a.max(b))).or_default() += 1;
            }
        }
        assert!(edges.values().all(|&n| n == 2), "every edge has two faces");
    }
}
