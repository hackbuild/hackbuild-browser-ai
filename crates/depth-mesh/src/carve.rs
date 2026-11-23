//! Silhouette space carving on a turntable (an earlier scan bench doCarve, the path that
//! beat depth tracking for printable meshes): a voxel is kept when it
//! projects inside every silhouette. The object turns by theta about +y;
//! the camera sits at distance d looking down +z, focal f in pixels, image
//! centre at the middle, v down. The field is blurred and meshed by
//! surface nets; vertices come back in object units.

use crate::math::sin_cos;
use crate::nets::{blur_pass, surface_nets};

#[derive(Clone, Copy, Debug)]
pub struct Turntable {
    pub width: usize,
    pub height: usize,
    /// Focal length, pixels.
    pub focal: f64,
    /// Camera to axis distance, object units.
    pub dist: f64,
    /// Half size of the carved cube, object units.
    pub half: f64,
}

/// The occupancy field: (n + 4)^3 values, 1 inside, -1 outside, a two cell empty border.
pub fn carve_field(masks: &[u8], angles: &[f64], n: usize, t: &Turntable) -> Vec<f32> {
    let pad = 2;
    let d = n + pad * 2;
    let (w, h) = (t.width, t.height);
    let (cx, cy) = (w as f64 / 2.0, h as f64 / 2.0);
    let vc = |g: usize| ((g as f64 - pad as f64) / (n as f64 - 1.0) * 2.0 - 1.0) * t.half;
    let sc: Vec<(f64, f64)> = angles.iter().map(|&a| sin_cos(a)).collect();
    let mut field = vec![-1f32; d * d * d];
    for z in pad..d - pad {
        for y in pad..d - pad {
            for x in pad..d - pad {
                let (ox, oy, oz) = (vc(x), vc(y), vc(z));
                let mut occ = true;
                for (k, &(s, c)) in sc.iter().enumerate() {
                    let wx = c * ox + s * oz;
                    let wz = -s * ox + c * oz;
                    let camz = wz + t.dist;
                    if camz <= 1e-4 {
                        occ = false;
                        break;
                    }
                    let u = (cx + t.focal * wx / camz + 0.5).floor();
                    let v = (cy - t.focal * oy / camz + 0.5).floor();
                    if u < 0.0
                        || v < 0.0
                        || u >= w as f64
                        || v >= h as f64
                        || masks[k * w * h + v as usize * w + u as usize] == 0
                    {
                        occ = false;
                        break;
                    }
                }
                if occ {
                    field[x + d * (y + d * z)] = 1.0;
                }
            }
        }
    }
    field
}

/// Carve, blur `smooth` times and mesh. Vertices in object units.
pub fn carve(
    masks: &[u8],
    angles: &[f64],
    n: usize,
    smooth: usize,
    t: &Turntable,
) -> (Vec<f32>, Vec<u32>) {
    let d = n + 4;
    let mut field = carve_field(masks, angles, n, t);
    for _ in 0..smooth {
        blur_pass(&mut field, d, d, d);
    }
    let (mut v, tris) = surface_nets(&field, d, d, d);
    for g in &mut v {
        *g = (((*g as f64 - 2.0) / (n as f64 - 1.0) * 2.0 - 1.0) * t.half) as f32;
    }
    (v, tris)
}

/// Erode then dilate a mask with a 3 by 3 square (as earlier builds did): kills speckle, keeps the object.
pub fn morph_open(src: &[u8], w: usize, h: usize) -> Vec<u8> {
    let at = |m: &[u8], x: i64, y: i64| {
        x >= 0
            && y >= 0
            && (x as usize) < w
            && (y as usize) < h
            && m[y as usize * w + x as usize] != 0
    };
    let mut er = vec![0u8; w * h];
    for y in 0..h as i64 {
        for x in 0..w as i64 {
            let all = (-1..=1).all(|dy| (-1..=1).all(|dx| at(src, x + dx, y + dy)));
            er[y as usize * w + x as usize] = all as u8;
        }
    }
    let mut out = vec![0u8; w * h];
    for y in 0..h as i64 {
        for x in 0..w as i64 {
            let any = (-1..=1).any(|dy| (-1..=1).any(|dx| at(&er, x + dx, y + dy)));
            out[y as usize * w + x as usize] = any as u8;
        }
    }
    out
}
