//! hackbuild-memory: BM25 plus flat cosine search fused by reciprocal rank,
//! linear and organic scorers, kind decay, strengthening on recall and near
//! duplicate merge. Builds natively and for wasm32-unknown-unknown with
//! simd128; the two give the same bits for the same input (tests/parity.rs).
//!
//! The wasm surface is plain `extern "C"` over linear memory, with no
//! bindgen: the caller allocates with `hm_alloc`, writes UTF-8 text, f32
//! vectors and an f64 parameter block, and reads results from the f64
//! buffer at `hm_out_ptr` after each call.

pub mod index;
pub mod math;
pub mod text;

use index::{Index, Item, Params, Scorer};
use std::cell::RefCell;

/// f64 slots per hit in the out buffer: id, bm25 rank, vector rank, bm25,
/// cosine, rrf, rel, rec, imp, ret, score.
pub const HIT_STRIDE: usize = 11;
/// f64 slots in the recall parameter block.
pub const PARAMS_LEN: usize = 18;

struct State {
    indexes: Vec<Option<Index>>,
    out: Vec<f64>,
}

thread_local! {
    static STATE: RefCell<State> = const { RefCell::new(State { indexes: Vec::new(), out: Vec::new() }) };
}

fn with_index<R>(h: u32, f: impl FnOnce(&mut Index, &mut Vec<f64>) -> R) -> Option<R> {
    STATE.with(|s| {
        let s = &mut *s.borrow_mut();
        let ix = s.indexes.get_mut(h as usize)?.as_mut()?;
        Some(f(ix, &mut s.out))
    })
}

/// Reads a recall parameter block (layout in the TS package, core.ts).
pub fn params_from(block: &[f64], scopes: &[u32]) -> Params {
    let g = |i: usize, d: f64| block.get(i).copied().unwrap_or(d);
    let d = Params::default();
    Params {
        k1: g(0, d.k1),
        b: g(1, d.b),
        rrf_k: g(2, d.rrf_k),
        cand: g(3, d.cand as f64) as usize,
        k: g(4, d.k as f64) as usize,
        now: g(5, 0.0),
        scorer: if g(6, 0.0) == 1.0 {
            Scorer::Organic
        } else {
            Scorer::Linear
        },
        w_rel: g(7, d.w_rel),
        w_rec: g(8, d.w_rec),
        w_imp: g(9, d.w_imp),
        tau_h: g(10, d.tau_h),
        vec_floor: g(11, d.vec_floor),
        valence: g(12, 0.0),
        place: if g(13, 0.0) == 1.0 {
            Some([g(14, 0.0), g(15, 0.0), g(16, 0.0)])
        } else {
            None
        },
        kinds: g(17, u32::MAX as f64) as u32,
        scopes: scopes.to_vec(),
    }
}

/// Writes hits into a flat f64 buffer, HIT_STRIDE slots each.
pub fn write_hits(out: &mut Vec<f64>, hits: &[index::Hit]) {
    out.clear();
    for h in hits {
        out.extend_from_slice(&[
            h.id as f64,
            h.bm25_rank as f64,
            h.vec_rank as f64,
            h.bm25,
            h.cos,
            h.rrf,
            h.rel,
            h.rec,
            h.imp,
            h.ret,
            h.score,
        ]);
    }
}

/// # Safety
/// `ptr` and `len` must describe readable memory or `len` must be 0.
unsafe fn str_at<'a>(ptr: *const u8, len: usize) -> &'a str {
    if len == 0 || ptr.is_null() {
        return "";
    }
    // SAFETY: the caller wrote len bytes of UTF-8 at ptr.
    let b = unsafe { std::slice::from_raw_parts(ptr, len) };
    std::str::from_utf8(b).unwrap_or("")
}

/// # Safety
/// `ptr` and `len` must describe `len` readable values or `len` must be 0.
unsafe fn slice_at<'a, T>(ptr: *const T, len: usize) -> &'a [T] {
    if len == 0 || ptr.is_null() {
        return &[];
    }
    // SAFETY: the caller wrote len values at ptr.
    unsafe { std::slice::from_raw_parts(ptr, len) }
}

/// Allocates len bytes, 8 byte aligned, for the caller to fill.
#[unsafe(no_mangle)]
pub extern "C" fn hm_alloc(len: usize) -> *mut u8 {
    let words = len.div_ceil(8).max(1);
    let mut v: Vec<u64> = vec![0; words];
    let p = v.as_mut_ptr() as *mut u8;
    std::mem::forget(v);
    p
}

/// Frees memory from hm_alloc with the same len.
///
/// # Safety
/// `ptr` must come from `hm_alloc(len)` and not be freed twice.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn hm_free(ptr: *mut u8, len: usize) {
    let words = len.div_ceil(8).max(1);
    // SAFETY: ptr came from hm_alloc with this word count.
    drop(unsafe { Vec::from_raw_parts(ptr as *mut u64, words, words) });
}

/// The out buffer, valid until the next call.
#[unsafe(no_mangle)]
pub extern "C" fn hm_out_ptr() -> *const f64 {
    STATE.with(|s| s.borrow().out.as_ptr())
}

/// A new index for vectors of dim floats; returns its handle.
#[unsafe(no_mangle)]
pub extern "C" fn hm_index_new(dim: u32) -> u32 {
    STATE.with(|s| {
        let mut s = s.borrow_mut();
        s.indexes.push(Some(Index::new(dim as usize)));
        (s.indexes.len() - 1) as u32
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn hm_index_drop(h: u32) {
    STATE.with(|s| {
        if let Some(slot) = s.borrow_mut().indexes.get_mut(h as usize) {
            *slot = None;
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn hm_index_len(h: u32) -> u32 {
    with_index(h, |ix, _| ix.items.len() as u32).unwrap_or(0)
}

/// Adds or replaces an item. Returns 1, or 0 for a bad handle.
///
/// # Safety
/// The text and vector pointers must describe readable memory.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn hm_upsert(
    h: u32,
    id: u32,
    scope: u32,
    kind: u32,
    created: f64,
    last_used: f64,
    importance: f64,
    arousal: f64,
    valence: f64,
    novelty: f64,
    uses: f64,
    weight: f64,
    has_place: u32,
    px: f64,
    py: f64,
    pz: f64,
    text_ptr: *const u8,
    text_len: usize,
    vec_ptr: *const f32,
    vec_len: usize,
) -> u32 {
    // SAFETY: forwarded from the caller.
    let (text, vec) = unsafe { (str_at(text_ptr, text_len), slice_at(vec_ptr, vec_len)) };
    let mut it = Item::new(id, scope, kind as u8, created, text);
    it.last_used = last_used;
    it.importance = importance;
    it.arousal = arousal;
    it.valence = valence;
    it.novelty = novelty;
    it.uses = uses;
    it.weight = weight;
    it.place = if has_place == 1 {
        Some([px, py, pz])
    } else {
        None
    };
    if !vec.is_empty() {
        it.set_vector(vec.to_vec());
    }
    with_index(h, |ix, _| ix.upsert(it)).map(|_| 1).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn hm_remove(h: u32, id: u32) -> u32 {
    with_index(h, |ix, _| ix.remove(id) as u32).unwrap_or(0)
}

/// Recall. Writes hits to the out buffer and returns their count.
///
/// # Safety
/// Every pointer and length pair must describe readable memory.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn hm_recall(
    h: u32,
    q_ptr: *const u8,
    q_len: usize,
    qv_ptr: *const f32,
    qv_len: usize,
    params_ptr: *const f64,
    params_len: usize,
    scopes_ptr: *const u32,
    scopes_len: usize,
) -> u32 {
    // SAFETY: forwarded from the caller.
    let (q, qv, block, scopes) = unsafe {
        (
            str_at(q_ptr, q_len),
            slice_at(qv_ptr, qv_len),
            slice_at(params_ptr, params_len),
            slice_at(scopes_ptr, scopes_len),
        )
    };
    let p = params_from(block, scopes);
    with_index(h, |ix, out| {
        let hits = ix.recall(q, if qv.is_empty() { None } else { Some(qv) }, &p);
        write_hits(out, &hits);
        hits.len() as u32
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn hm_touch(h: u32, id: u32, now: f64) -> u32 {
    with_index(h, |ix, _| ix.touch(id, now) as u32).unwrap_or(0)
}

/// Writes an item's numbers to the out buffer: created, last used,
/// importance, arousal, valence, novelty, uses, weight. Returns 1 if found.
#[unsafe(no_mangle)]
pub extern "C" fn hm_item(h: u32, id: u32) -> u32 {
    with_index(h, |ix, out| match ix.position(id) {
        Some(i) => {
            let it = &ix.items[i];
            out.clear();
            out.extend_from_slice(&[
                it.created,
                it.last_used,
                it.importance,
                it.arousal,
                it.valence,
                it.novelty,
                it.uses,
                it.weight,
            ]);
            1
        }
        None => 0,
    })
    .unwrap_or(0)
}

/// The id of a near duplicate, or -1.
///
/// # Safety
/// The text and vector pointers must describe readable memory.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn hm_find_dup(
    h: u32,
    text_ptr: *const u8,
    text_len: usize,
    vec_ptr: *const f32,
    vec_len: usize,
    kind: u32,
    scope: u32,
    now: f64,
    window_h: f64,
    threshold: f64,
) -> f64 {
    // SAFETY: forwarded from the caller.
    let (text, vec) = unsafe { (str_at(text_ptr, text_len), slice_at(vec_ptr, vec_len)) };
    let v = if vec.is_empty() { None } else { Some(vec) };
    with_index(h, |ix, _| {
        ix.find_dup(text, v, kind as u8, scope, now, window_h, threshold)
    })
    .flatten()
    .map(|id| id as f64)
    .unwrap_or(-1.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn hm_merge(h: u32, keep: u32, drop: u32) -> u32 {
    with_index(h, |ix, _| ix.merge(keep, drop) as u32).unwrap_or(0)
}

/// Merges near duplicates; out holds keep, drop pairs. Returns the pair count.
#[unsafe(no_mangle)]
pub extern "C" fn hm_merge_near(h: u32, threshold: f64) -> u32 {
    with_index(h, |ix, out| {
        let pairs = ix.merge_near(threshold);
        out.clear();
        for (k, d) in &pairs {
            out.push(*k as f64);
            out.push(*d as f64);
        }
        pairs.len() as u32
    })
    .unwrap_or(0)
}

/// Drops items under the retention floor; out holds their ids. Returns the count.
#[unsafe(no_mangle)]
pub extern "C" fn hm_decay(h: u32, now: f64, floor: f64) -> u32 {
    with_index(h, |ix, out| {
        let gone = ix.decay(now, floor);
        out.clear();
        out.extend(gone.iter().map(|g| *g as f64));
        gone.len() as u32
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn hm_retention(kind: u32, age_h: f64, uses: f64) -> f64 {
    index::retention(kind as u8, age_h, uses)
}

#[unsafe(no_mangle)]
pub extern "C" fn hm_exp(x: f64) -> f64 {
    math::exp(x)
}

#[unsafe(no_mangle)]
pub extern "C" fn hm_ln(x: f64) -> f64 {
    math::ln(x)
}

/// 1 when this build runs the dot product on wasm simd128 lanes.
#[unsafe(no_mangle)]
pub extern "C" fn hm_simd() -> u32 {
    cfg!(all(target_arch = "wasm32", target_feature = "simd128")) as u32
}
