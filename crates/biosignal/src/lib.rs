//! hackbuild-biosignal: EEG zero phase filters, shrunk covariances, a
//! Riemannian tangent space classifier (log-Euclidean reference,
//! multinomial logistic regression) and leak free cross validation, from
//! COLLET. Builds natively and for wasm32-unknown-unknown with simd128; the
//! two give the same bits (tests/parity.rs and the TS parity test).
//!
//! The wasm surface is plain `extern "C"`: buffers from `bs_alloc`, results
//! in the f64 out buffer (`bs_out_f64`) or the f32 one (`bs_out_f32`).

// Matrix loops index several buffers in step; ranges read clearer than zips.
#![allow(clippy::needless_range_loop, clippy::too_many_arguments)]

pub mod classify;
pub mod filters;
pub mod math;
pub mod riemann;

use std::cell::RefCell;

struct State {
    d: Vec<f64>,
    f: Vec<f32>,
    models: Vec<Option<classify::Model>>,
}

thread_local! {
    static S: RefCell<State> = const { RefCell::new(State { d: Vec::new(), f: Vec::new(), models: Vec::new() }) };
}

fn out(d: Vec<f64>) {
    S.with(|s| s.borrow_mut().d = d);
}

/// # Safety
/// p points to n values or n is 0.
unsafe fn rd<'a, T>(p: *const T, n: usize) -> &'a [T] {
    if n == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(p, n) }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bs_alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u64> = vec![0; len.div_ceil(8).max(1)];
    let p = v.as_mut_ptr() as *mut u8;
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `bs_alloc(len)` and not be freed twice.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bs_free(ptr: *mut u8, len: usize) {
    let w = len.div_ceil(8).max(1);
    // SAFETY: ptr came from bs_alloc with this word count.
    drop(unsafe { Vec::from_raw_parts(ptr as *mut u64, w, w) });
}

#[unsafe(no_mangle)]
pub extern "C" fn bs_out_f64() -> *const f64 {
    S.with(|s| s.borrow().d.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn bs_out_f32() -> *const f32 {
    S.with(|s| s.borrow().f.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn bs_out_len() -> usize {
    S.with(|s| s.borrow().d.len())
}

#[unsafe(no_mangle)]
pub extern "C" fn bs_simd() -> u32 {
    cfg!(all(target_arch = "wasm32", target_feature = "simd128")) as u32
}

/// # Safety
/// x and out hold n values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bs_bandpass(
    x: *const f32,
    n: usize,
    fs: f64,
    lo: f64,
    hi: f64,
    notch: f64,
    outp: *mut f32,
) {
    let y = filters::bandpass_zero_phase(unsafe { rd(x, n) }, fs, lo, hi, notch);
    if n > 0 {
        unsafe { std::slice::from_raw_parts_mut(outp, n) }.copy_from_slice(&y);
    }
}

/// # Safety
/// x holds c * t values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bs_cov(x: *const f32, c: usize, t: usize, shrink: f64) {
    out(riemann::covariance(unsafe { rd(x, c * t) }, c, t, shrink));
}

/// # Safety
/// cm and p hold c * c values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bs_tangent(cm: *const f64, p: *const f64, c: usize) {
    out(riemann::tangent(
        unsafe { rd(cm, c * c) },
        unsafe { rd(p, c * c) },
        c,
    ));
}

/// # Safety
/// a and b hold c * c values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bs_distance(a: *const f64, b: *const f64, c: usize) -> f64 {
    riemann::distance(unsafe { rd(a, c * c) }, unsafe { rd(b, c * c) }, c)
}

fn unpack(covs: &[f64], n: usize, bands: usize, c: usize) -> Vec<Vec<Vec<f64>>> {
    (0..n)
        .map(|i| {
            (0..bands)
                .map(|b| covs[(i * bands + b) * c * c..(i * bands + b + 1) * c * c].to_vec())
                .collect()
        })
        .collect()
}

/// Train; returns a model handle.
///
/// # Safety
/// covs holds n * bands * c * c values, y holds n.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bs_fit(
    covs: *const f64,
    n: usize,
    bands: usize,
    c: usize,
    y: *const u32,
    k: usize,
    l2: f64,
    epochs: usize,
    lr: f64,
) -> u32 {
    let cv = unpack(unsafe { rd(covs, n * bands * c * c) }, n, bands, c);
    let yy: Vec<usize> = unsafe { rd(y, n) }.iter().map(|&v| v as usize).collect();
    let m = classify::fit(&cv, &yy, k, c, &classify::Params { l2, epochs, lr });
    S.with(|s| {
        let s = &mut *s.borrow_mut();
        s.models.push(Some(m));
        (s.models.len() - 1) as u32
    })
}

/// Class probabilities to out.
///
/// # Safety
/// covs holds bands * c * c values for the model's bands and c.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bs_proba(h: u32, covs: *const f64) -> u32 {
    S.with(|s| {
        let s = &mut *s.borrow_mut();
        let Some(Some(m)) = s.models.get(h as usize) else {
            return 0;
        };
        let cv = unpack(unsafe { rd(covs, m.bands * m.c * m.c) }, 1, m.bands, m.c);
        s.d = m.proba(&cv[0]);
        1
    })
}

/// Model to out: c, bands, k, d, projectors, w, b, mu, sd.
#[unsafe(no_mangle)]
pub extern "C" fn bs_export(h: u32) -> usize {
    S.with(|s| {
        let s = &mut *s.borrow_mut();
        let Some(Some(m)) = s.models.get(h as usize) else {
            return 0;
        };
        let r = &m.reg;
        let mut v = vec![m.c as f64, m.bands as f64, r.k as f64, r.d as f64];
        for p in &m.projectors {
            v.extend_from_slice(p);
        }
        for part in [&r.w, &r.b, &r.mu, &r.sd] {
            v.extend_from_slice(part);
        }
        s.d = v;
        s.d.len()
    })
}

/// Rebuild a model from bs_export's layout; returns a handle, or u32::MAX when the layout is short.
///
/// # Safety
/// v holds n values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bs_import(v: *const f64, n: usize) -> u32 {
    let v = unsafe { rd(v, n) };
    if n < 4 {
        return u32::MAX;
    }
    let (c, bands, k, d) = (v[0] as usize, v[1] as usize, v[2] as usize, v[3] as usize);
    if n != 4 + bands * c * c + k * d + k + 2 * d {
        return u32::MAX;
    }
    let mut o = 4;
    let mut take = |len: usize| {
        let s = v[o..o + len].to_vec();
        o += len;
        s
    };
    let projectors = (0..bands).map(|_| take(c * c)).collect();
    let reg = classify::LogReg {
        w: take(k * d),
        b: take(k),
        mu: take(d),
        sd: take(d),
        k,
        d,
    };
    S.with(|s| {
        let s = &mut *s.borrow_mut();
        s.models.push(Some(classify::Model {
            c,
            bands,
            projectors,
            reg,
        }));
        (s.models.len() - 1) as u32
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn bs_drop(h: u32) {
    S.with(|s| {
        if let Some(m) = s.borrow_mut().models.get_mut(h as usize) {
            *m = None;
        }
    });
}

/// Per fold accuracy to out.
///
/// # Safety
/// covs holds n * bands * c * c values, y and trials hold n.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bs_cv(
    covs: *const f64,
    n: usize,
    bands: usize,
    c: usize,
    y: *const u32,
    trials: *const u32,
    k: usize,
    nfolds: usize,
    by_trial: u32,
    seed: u32,
    l2: f64,
    epochs: usize,
    lr: f64,
) {
    let cv = unpack(unsafe { rd(covs, n * bands * c * c) }, n, bands, c);
    let yy: Vec<usize> = unsafe { rd(y, n) }.iter().map(|&v| v as usize).collect();
    let tr = unsafe { rd(trials, n) };
    out(classify::cross_validate(
        &cv,
        &yy,
        tr,
        k,
        c,
        nfolds,
        by_trial != 0,
        seed,
        &classify::Params { l2, epochs, lr },
    ));
}

/// Fixture: windows to out f32 (n * c * t), then labels and trial ids to out f64 (2n). Returns n.
#[unsafe(no_mangle)]
pub extern "C" fn bs_synth(
    seed: u32,
    c: usize,
    t: usize,
    fs: f64,
    hz: f64,
    trials: usize,
    per: usize,
) -> usize {
    let (x, y, tr) = classify::synth_epochs(seed, c, t, fs, hz, trials, per);
    let n = y.len();
    S.with(|s| {
        let s = &mut *s.borrow_mut();
        s.f = x;
        s.d = y
            .iter()
            .map(|&v| v as f64)
            .chain(tr.iter().map(|&v| v as f64))
            .collect();
    });
    n
}
