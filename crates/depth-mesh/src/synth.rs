//! Seeded fixtures shared by the native tests and the wasm parity test: a
//! depth map of a sphere on a plane, and turntable silhouettes of a box.

use crate::carve::Turntable;
use crate::math::sin_cos;

/// A sphere of radius 0.3 h in front of a plane; 0 to 1, larger nearer.
pub fn sphere_depth(w: usize, h: usize) -> Vec<f32> {
    let (cx, cy, r) = (w as f64 / 2.0, h as f64 / 2.0, 0.3 * h as f64);
    let mut d = vec![0.2f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let q = ((x as f64 - cx).powi(2) + (y as f64 - cy).powi(2)) / (r * r);
            if q < 1.0 {
                d[y * w + x] = (0.2 + 0.6 * (1.0 - q).sqrt()) as f32;
            }
        }
    }
    d
}

/// Silhouette of a box with half extents `e` turned by theta, by ray casting each pixel.
pub fn box_silhouette(theta: f64, e: [f64; 3], t: &Turntable) -> Vec<u8> {
    let (s, c) = sin_cos(theta);
    let (cx, cy) = (t.width as f64 / 2.0, t.height as f64 / 2.0);
    let mut m = vec![0u8; t.width * t.height];
    for v in 0..t.height {
        for u in 0..t.width {
            // world ray from (0, 0, -d) through the pixel, then into object space
            let (dwx, dwy, dwz) = ((u as f64 - cx) / t.focal, -(v as f64 - cy) / t.focal, 1.0);
            let (owx, owz) = (0.0, -t.dist);
            let o = [c * owx - s * owz, 0.0, s * owx + c * owz];
            let dir = [c * dwx - s * dwz, dwy, s * dwx + c * dwz];
            let (mut t0, mut t1) = (f64::NEG_INFINITY, f64::INFINITY);
            let mut hit = true;
            for k in 0..3 {
                if dir[k].abs() < 1e-12 {
                    if o[k].abs() > e[k] {
                        hit = false;
                    }
                    continue;
                }
                let (a, b) = ((-e[k] - o[k]) / dir[k], (e[k] - o[k]) / dir[k]);
                t0 = t0.max(a.min(b));
                t1 = t1.min(a.max(b));
            }
            if hit && t1 >= t0 && t1 > 0.0 {
                m[v * t.width + u] = 1;
            }
        }
    }
    m
}
