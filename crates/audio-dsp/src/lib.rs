//! hackbuild-audio-dsp: the speech front end of SCRIBE July (dc block,
//! cascaded high pass, a speech band copy, frame levels, minimum statistics
//! noise floor, spectral subtraction, lookahead limiter), resampling, STFT
//! magnitudes, onsets, tempo and grid fit (SCRIBE August). Builds natively
//! and for wasm32-unknown-unknown with simd128; the two give the same bits
//! for the same input (tests/parity.rs and the TS parity test).
//!
//! The wasm surface is plain `extern "C"` over linear memory: the caller
//! allocates with `ad_alloc`, writes f32 samples, passes pointers and
//! lengths, and reads variable length results from the f64 buffer at
//! `ad_out_ptr`.

// DSP loops index several buffers in step; ranges read clearer than zips.
#![allow(clippy::needless_range_loop)]

pub mod denoise;
pub mod fft;
pub mod filters;
pub mod levels;
pub mod math;
pub mod onset;
pub mod resample;
pub mod synth;

use std::cell::RefCell;

thread_local! {
    static OUT: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

fn set_out(v: &[f64]) {
    OUT.with(|o| {
        let o = &mut *o.borrow_mut();
        o.clear();
        o.extend_from_slice(v);
    });
}

/// # Safety
/// p must point to n valid f32 values, or n must be 0.
unsafe fn rd<'a>(p: *const f32, n: usize) -> &'a [f32] {
    if n == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(p, n) }
    }
}

/// # Safety
/// p must point to n writable f32 values, or n must be 0.
unsafe fn wr<'a>(p: *mut f32, n: usize) -> &'a mut [f32] {
    if n == 0 {
        &mut []
    } else {
        unsafe { std::slice::from_raw_parts_mut(p, n) }
    }
}

fn kind(k: u32) -> filters::Kind {
    match k {
        1 => filters::Kind::Lowpass,
        2 => filters::Kind::Bandpass,
        _ => filters::Kind::Highpass,
    }
}

/// Allocates len bytes, 8 byte aligned. Free with ad_free(ptr, len).
#[unsafe(no_mangle)]
pub extern "C" fn ad_alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u64> = vec![0; len.div_ceil(8).max(1)];
    let p = v.as_mut_ptr() as *mut u8;
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `ad_alloc(len)` and not be freed twice.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_free(ptr: *mut u8, len: usize) {
    let w = len.div_ceil(8).max(1);
    // SAFETY: ptr came from ad_alloc with this word count.
    drop(unsafe { Vec::from_raw_parts(ptr as *mut u64, w, w) });
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_out_ptr() -> *const f64 {
    OUT.with(|o| o.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_simd() -> u32 {
    cfg!(all(target_arch = "wasm32", target_feature = "simd128")) as u32
}

/// # Safety
/// x and out hold n f32 values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_dc_block(x: *const f32, n: usize, out: *mut f32) {
    unsafe { filters::dc_block(rd(x, n), wr(out, n)) }
}

/// Writes b0 b1 b2 a1 a2 to the out buffer.
#[unsafe(no_mangle)]
pub extern "C" fn ad_biquad_coef(k: u32, fc: f64, fs: f64, q: f64) -> u32 {
    set_out(&filters::coef(kind(k), fc, fs, q));
    5
}

/// # Safety
/// x and out hold n f32 values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_biquad(
    x: *const f32,
    n: usize,
    k: u32,
    fc: f64,
    fs: f64,
    q: f64,
    out: *mut f32,
) {
    let c = filters::coef(kind(k), fc, fs, q);
    unsafe { filters::biquad(rd(x, n), &c, wr(out, n)) }
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_frame_count(n: usize, frame: usize, hop: usize) -> usize {
    levels::frame_count(n, frame, hop)
}

/// # Safety
/// x holds n values, out holds ad_frame_count(n, frame, hop) values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_frame_db(
    x: *const f32,
    n: usize,
    hop: usize,
    frame: usize,
    out: *mut f32,
) {
    let m = levels::frame_count(n, frame, hop);
    unsafe { levels::frame_db(rd(x, n), hop, frame, wr(out, m)) }
}

/// # Safety
/// x holds n values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_percentile(x: *const f32, n: usize, q: f64) -> f32 {
    unsafe { levels::percentile(rd(x, n), q) }
}

/// # Safety
/// db holds n values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_noise_floor(db: *const f32, n: usize, win: usize) -> f32 {
    unsafe { levels::noise_floor(rd(db, n), win) }
}

/// # Safety
/// x holds n values, out holds m.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_envelope_peak(x: *const f32, n: usize, out: *mut f32, m: usize) {
    unsafe { levels::envelope_peak(rd(x, n), wr(out, m)) }
}

/// # Safety
/// x holds n values, out holds n / hop.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_envelope_rms(x: *const f32, n: usize, hop: usize, out: *mut f32) {
    unsafe { levels::envelope_rms(rd(x, n), hop, wr(out, n / hop.max(1))) }
}

/// Noise print into out (w / 2 + 1 values). Returns the bin count, or 0
/// when no frame fits.
///
/// # Safety
/// sig holds n values, db holds nd, out holds w / 2 + 1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_noise_spectrum(
    sig: *const f32,
    n: usize,
    db: *const f32,
    nd: usize,
    floor_db: f32,
    w: usize,
    frame_hop: usize,
    out: *mut f32,
) -> usize {
    match unsafe { denoise::noise_spectrum(rd(sig, n), rd(db, nd), floor_db, w, frame_hop) } {
        Some(v) => {
            unsafe { wr(out, v.len()) }.copy_from_slice(&v);
            v.len()
        }
        None => 0,
    }
}

/// # Safety
/// x and out hold n values, noise holds w / 2 + 1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_denoise(
    x: *const f32,
    n: usize,
    noise: *const f32,
    alpha: f64,
    g_floor: f64,
    w: usize,
    h: usize,
    out: *mut f32,
) {
    let y = unsafe { denoise::denoise(rd(x, n), rd(noise, w / 2 + 1), alpha, g_floor, w, h) };
    unsafe { wr(out, n) }.copy_from_slice(&y);
}

/// In place.
///
/// # Safety
/// x holds n values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_limit(x: *mut f32, n: usize, ceil: f64, sr: f64) {
    unsafe { filters::limit(wr(x, n), ceil, sr) }
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_resample_len(n: usize, src: f64, dst: f64) -> usize {
    resample::out_len(n, src, dst)
}

/// # Safety
/// x holds n values, out holds m.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_resample_linear(
    x: *const f32,
    n: usize,
    src: f64,
    dst: f64,
    out: *mut f32,
    m: usize,
) {
    unsafe { resample::linear(rd(x, n), src, dst, wr(out, m)) }
}

/// # Safety
/// x holds n values, out holds m.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_resample_sinc(
    x: *const f32,
    n: usize,
    src: f64,
    dst: f64,
    zeros: usize,
    out: *mut f32,
    m: usize,
) {
    unsafe { resample::sinc_resample(rd(x, n), src, dst, zeros, wr(out, m)) }
}

/// # Safety
/// x holds n values, out holds n / factor.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_decimate(
    x: *const f32,
    n: usize,
    factor: usize,
    taps: usize,
    cutoff: f64,
    sr: f64,
    out: *mut f32,
) {
    let h = resample::lowpass_taps(taps, cutoff, sr);
    unsafe { resample::decimate(rd(x, n), factor, &h, wr(out, n / factor.max(1))) }
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_stft_frames(n: usize, w: usize, hop: usize) -> usize {
    if n < w { 1 } else { (n - w) / hop + 1 }
}

/// # Safety
/// x holds n values, out holds ad_stft_frames(n, w, hop) * (w / 2 + 1).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_stft_mag(
    x: *const f32,
    n: usize,
    w: usize,
    hop: usize,
    out: *mut f32,
) -> usize {
    let (m, frames) = fft::stft_mag(unsafe { rd(x, n) }, w, hop);
    unsafe { wr(out, m.len()) }.copy_from_slice(&m);
    frames
}

/// Onsets as (frame, peak, strength) triples in the out buffer; returns the count.
///
/// # Safety
/// env holds n values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_pick_onsets(
    env: *const f32,
    n: usize,
    fps: f64,
    min_gap: f64,
    sens: f64,
    gate: f64,
) -> usize {
    let hits = onset::pick_onsets(unsafe { rd(env, n) }, fps, min_gap, sens, gate);
    let flat: Vec<f64> = hits
        .iter()
        .flat_map(|h| [h.frame as f64, h.peak as f64, h.strength as f64])
        .collect();
    set_out(&flat);
    hits.len()
}

/// bpm and offset in the out buffer.
///
/// # Safety
/// env holds n values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_estimate_tempo(env: *const f32, n: usize, fps: f64) {
    let (b, o) = onset::estimate_tempo(unsafe { rd(env, n) }, fps);
    set_out(&[b, o]);
}

/// bpm, offset and R in the out buffer; returns 0 when the weights sum to 0.
///
/// # Safety
/// times and weights hold n f64 values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_fit_grid(times: *const f64, weights: *const f64, n: usize) -> u32 {
    let (t, w) = if n == 0 {
        (&[][..], &[][..])
    } else {
        unsafe {
            (
                std::slice::from_raw_parts(times, n),
                std::slice::from_raw_parts(weights, n),
            )
        }
    };
    match onset::fit_grid(t, w) {
        Some((b, o, r)) => {
            set_out(&[b, o, r]);
            1
        }
        None => 0,
    }
}

/// # Safety
/// out holds n values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ad_synth(seed: u32, n: usize, sr: f64, out: *mut f32) {
    synth::speechlike(seed, n, sr, unsafe { wr(out, n) })
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_sin(x: f64) -> f64 {
    math::sin(x)
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_cos(x: f64) -> f64 {
    math::cos(x)
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_exp(x: f64) -> f64 {
    math::exp(x)
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_ln(x: f64) -> f64 {
    math::ln(x)
}

#[unsafe(no_mangle)]
pub extern "C" fn ad_atan2(y: f64, x: f64) -> f64 {
    math::atan2(y, x)
}
