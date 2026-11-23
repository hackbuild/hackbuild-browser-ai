//! hackbuild-depth-mesh: depth to point cloud with normals, relief
//! heightfields and their closed meshes, surface nets, point to plane ICP
//! against a voxel model, and silhouette space carving (CALIPER and BAIL).
//! Builds natively and for wasm32-unknown-unknown with simd128; the two
//! give the same bits for the same input (tests/parity.rs and the TS
//! parity test).
//!
//! The wasm surface is plain `extern "C"`: the caller allocates with
//! `dm_alloc`, passes pointers and lengths, and reads results from the f32
//! and u32 out buffers (`dm_out_f32`, `dm_out_u32`) after each call.

// Mesh loops index several buffers in step; ranges read clearer than zips.
#![allow(clippy::needless_range_loop, clippy::too_many_arguments)]

pub mod carve;
pub mod cloud;
pub mod icp;
pub mod math;
pub mod nets;
pub mod relief;
pub mod synth;

use std::cell::RefCell;

struct State {
    f: Vec<f32>,
    f2: Vec<f32>,
    u: Vec<u32>,
    d: Vec<f64>,
    models: Vec<Option<icp::Model>>,
}

thread_local! {
    static S: RefCell<State> = const { RefCell::new(State { f: Vec::new(), f2: Vec::new(), u: Vec::new(), d: Vec::new(), models: Vec::new() }) };
}

fn put(f: Vec<f32>, f2: Vec<f32>, u: Vec<u32>) {
    S.with(|s| {
        let s = &mut *s.borrow_mut();
        s.f = f;
        s.f2 = f2;
        s.u = u;
    });
}

/// # Safety
/// p must point to n valid values, or n must be 0.
unsafe fn rd<'a, T>(p: *const T, n: usize) -> &'a [T] {
    if n == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(p, n) }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u64> = vec![0; len.div_ceil(8).max(1)];
    let p = v.as_mut_ptr() as *mut u8;
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `dm_alloc(len)` and not be freed twice.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_free(ptr: *mut u8, len: usize) {
    let w = len.div_ceil(8).max(1);
    // SAFETY: ptr came from dm_alloc with this word count.
    drop(unsafe { Vec::from_raw_parts(ptr as *mut u64, w, w) });
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_out_f32() -> *const f32 {
    S.with(|s| s.borrow().f.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_out_f32b() -> *const f32 {
    S.with(|s| s.borrow().f2.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_out_u32() -> *const u32 {
    S.with(|s| s.borrow().u.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_out_f64() -> *const f64 {
    S.with(|s| s.borrow().d.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_out_len_f32() -> usize {
    S.with(|s| s.borrow().f.len())
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_out_len_u32() -> usize {
    S.with(|s| s.borrow().u.len())
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_simd() -> u32 {
    cfg!(all(target_arch = "wasm32", target_feature = "simd128")) as u32
}

/// Positions to out f32, normals to out f32b. Returns the point count.
///
/// # Safety
/// depth holds w * h values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_cloud(
    depth: *const f32,
    w: usize,
    h: usize,
    near: f64,
    far: f64,
    focal: f64,
    stride: usize,
    dmin: f64,
    dmax: f64,
) -> usize {
    let p = cloud::CloudParams {
        near,
        far,
        focal,
        stride,
        dmin,
        dmax,
    };
    let (pos, nor) = cloud::build_cloud(unsafe { rd(depth, w * h) }, w, h, &p);
    let n = pos.len() / 3;
    put(pos, nor, Vec::new());
    n
}

/// Heights to out f32. mask may be null.
///
/// # Safety
/// v holds n values; mask is null or holds n bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_relief(
    v: *const f32,
    n: usize,
    mask: *const u8,
    base: f64,
    height: f64,
    gamma: f64,
    bgcut: f64,
    invert: u32,
) -> usize {
    let p = relief::ReliefParams {
        base,
        height,
        gamma,
        bgcut,
        invert: invert != 0,
    };
    let m = if mask.is_null() {
        None
    } else {
        Some(unsafe { rd(mask, n) })
    };
    let out = relief::heights(unsafe { rd(v, n) }, m, &p);
    put(out, Vec::new(), Vec::new());
    n
}

/// Heals pinches in place; returns the fills.
///
/// # Safety
/// h holds w * ht writable values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_heal(h: *mut f32, w: usize, ht: usize) -> usize {
    relief::heal_pinches(unsafe { std::slice::from_raw_parts_mut(h, w * ht) }, w, ht)
}

/// Positions to out f32, indices to out u32. Returns the triangle count.
///
/// # Safety
/// h holds w * ht values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_heightfield(
    h: *const f32,
    w: usize,
    ht: usize,
    px: f64,
    x0: f64,
    y0: f64,
    z0: f64,
) -> usize {
    let m = relief::heightfield_mesh(unsafe { rd(h, w * ht) }, w, ht, px, x0, y0, z0);
    let t = m.indices.len() / 3;
    put(m.positions, Vec::new(), m.indices);
    t
}

/// Blur `smooth` times, then surface nets. Returns the triangle count.
///
/// # Safety
/// field holds dx * dy * dz values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_surface_nets(
    field: *const f32,
    dx: usize,
    dy: usize,
    dz: usize,
    smooth: usize,
) -> usize {
    let mut f = unsafe { rd(field, dx * dy * dz) }.to_vec();
    for _ in 0..smooth {
        nets::blur_pass(&mut f, dx, dy, dz);
    }
    let (v, t) = nets::surface_nets(&f, dx, dy, dz);
    let n = t.len() / 3;
    put(v, Vec::new(), t);
    n
}

/// # Safety
/// masks holds angles.len() * w * h bytes, angles holds nv values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_carve(
    masks: *const u8,
    angles: *const f64,
    nv: usize,
    w: usize,
    h: usize,
    focal: f64,
    dist: f64,
    half: f64,
    n: usize,
    smooth: usize,
) -> usize {
    let t = carve::Turntable {
        width: w,
        height: h,
        focal,
        dist,
        half,
    };
    let (v, tris) = carve::carve(
        unsafe { rd(masks, nv * w * h) },
        unsafe { rd(angles, nv) },
        n,
        smooth,
        &t,
    );
    let c = tris.len() / 3;
    put(v, Vec::new(), tris);
    c
}

/// Opened mask to out u32 (0 or 1 per pixel).
///
/// # Safety
/// m holds w * h bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_morph_open(m: *const u8, w: usize, h: usize) {
    let o = carve::morph_open(unsafe { rd(m, w * h) }, w, h);
    put(
        Vec::new(),
        Vec::new(),
        o.into_iter().map(u32::from).collect(),
    );
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_model_new(voxel: f64, cap: usize) -> u32 {
    S.with(|s| {
        let s = &mut *s.borrow_mut();
        s.models.push(Some(icp::Model::new(voxel, cap)));
        (s.models.len() - 1) as u32
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_model_drop(h: u32) {
    S.with(|s| {
        if let Some(m) = s.borrow_mut().models.get_mut(h as usize) {
            *m = None;
        }
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn dm_model_len(h: u32) -> usize {
    S.with(|s| {
        s.borrow()
            .models
            .get(h as usize)
            .and_then(|m| m.as_ref())
            .map_or(0, |m| m.map.len())
    })
}

fn pose_from(p: &[f64]) -> icp::Pose {
    let mut r = [0f64; 9];
    r.copy_from_slice(&p[..9]);
    (r, [p[9], p[10], p[11]])
}

/// # Safety
/// pos and nor hold n * 3 values, pose holds 12 (row major R, then t).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_model_integrate(
    h: u32,
    pos: *const f32,
    nor: *const f32,
    n: usize,
    pose: *const f64,
) {
    let pose = pose_from(unsafe { rd(pose, 12) });
    let (p, q) = unsafe { (rd(pos, n * 3), rd(nor, n * 3)) };
    S.with(|s| {
        if let Some(Some(m)) = s.borrow_mut().models.get_mut(h as usize) {
            m.integrate(p, q, &pose);
        }
    });
}

/// Pose (12), inliers and error to out f64. Returns 1, or 0 for a bad handle.
///
/// # Safety
/// pos and nor hold n * 3 values, pose holds 12.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dm_model_icp(
    h: u32,
    pos: *const f32,
    nor: *const f32,
    n: usize,
    pose: *const f64,
    step: usize,
    iters: usize,
    max_d: f64,
    norm_t: f64,
) -> u32 {
    let start = pose_from(unsafe { rd(pose, 12) });
    let (p, q) = unsafe { (rd(pos, n * 3), rd(nor, n * 3)) };
    S.with(|s| {
        let s = &mut *s.borrow_mut();
        let Some(Some(m)) = s.models.get(h as usize) else {
            return 0;
        };
        let (pose, inl, err) = m.icp(p, q, &start, step, iters, max_d, norm_t);
        s.d = pose
            .0
            .iter()
            .chain(pose.1.iter())
            .copied()
            .chain([inl as f64, err])
            .collect();
        1
    })
}

/// Model points to out f32, normals to out f32b. Returns the count.
#[unsafe(no_mangle)]
pub extern "C" fn dm_model_points(h: u32) -> usize {
    let got = S.with(|s| {
        let s = s.borrow();
        s.models.get(h as usize).and_then(|m| m.as_ref()).map(|m| {
            let mut p = Vec::with_capacity(m.map.len() * 3);
            let mut n = Vec::with_capacity(m.map.len() * 3);
            for r in m.map.values() {
                p.extend(r.p.iter().map(|&v| v as f32));
                n.extend(r.n.iter().map(|&v| v as f32));
            }
            (p, n)
        })
    });
    let Some((p, n)) = got else { return 0 };
    let c = p.len() / 3;
    put(p, n, Vec::new());
    c
}

/// rodrigues(w) to out f64 (9 values).
#[unsafe(no_mangle)]
pub extern "C" fn dm_rodrigues(x: f64, y: f64, z: f64) {
    let r = icp::rodrigues([x, y, z]);
    S.with(|s| s.borrow_mut().d = r.to_vec());
}

/// Sphere depth fixture to out f32.
#[unsafe(no_mangle)]
pub extern "C" fn dm_synth_depth(w: usize, h: usize) {
    put(synth::sphere_depth(w, h), Vec::new(), Vec::new());
}

/// Box silhouette fixture to out u32 (0 or 1).
#[unsafe(no_mangle)]
pub extern "C" fn dm_synth_box(
    theta: f64,
    ex: f64,
    ey: f64,
    ez: f64,
    w: usize,
    h: usize,
    focal: f64,
    dist: f64,
) {
    let t = carve::Turntable {
        width: w,
        height: h,
        focal,
        dist,
        half: 0.0,
    };
    let m = synth::box_silhouette(theta, [ex, ey, ez], &t);
    put(
        Vec::new(),
        Vec::new(),
        m.into_iter().map(u32::from).collect(),
    );
}
