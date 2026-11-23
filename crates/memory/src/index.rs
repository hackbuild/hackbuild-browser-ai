//! The memory index: items with BM25 tokens and an optional vector, hybrid
//! recall fused by reciprocal rank, two scorers, kind decay, strengthening
//! on recall and near duplicate merge. Times are hours on any fixed epoch;
//! the TS package passes milliseconds since 1970 divided by 3 600 000.

use crate::math::{dot, exp, half_pow, ln};
use crate::text::tokenize;
use std::collections::HashMap;

/// Item kinds. Rule, lore and doc never decay.
pub const KIND_EPISODE: u8 = 0;
pub const KIND_GIST: u8 = 1;
pub const KIND_LESSON: u8 = 2;
pub const KIND_FACT: u8 = 3;
pub const KIND_RULE: u8 = 4;
pub const KIND_LORE: u8 = 5;
pub const KIND_DOC: u8 = 6;
pub const KIND_NOTE: u8 = 7;

/// Half-life in hours per kind, 0 for never (the embodied twin table,
/// inferred from its source). Note decays like a fact.
pub fn half_life(kind: u8) -> f64 {
    match kind {
        KIND_EPISODE => 6.0,
        KIND_GIST => 96.0,
        KIND_LESSON => 240.0,
        KIND_FACT | KIND_NOTE => 720.0,
        _ => 0.0,
    }
}

/// Retention in 0 to 1: 0.5 ^ (age / half), the half-life lengthened by
/// 50 percent per use. Kinds that never decay return 1.
pub fn retention(kind: u8, age_h: f64, uses: f64) -> f64 {
    let h = half_life(kind);
    if h <= 0.0 {
        return 1.0;
    }
    half_pow(age_h.max(0.0) / (h * (1.0 + 0.5 * uses)))
}

#[derive(Clone, Debug, PartialEq)]
pub struct Item {
    pub id: u32,
    pub scope: u32,
    pub kind: u8,
    pub created: f64,
    pub last_used: f64,
    pub importance: f64,
    pub arousal: f64,
    pub valence: f64,
    pub novelty: f64,
    pub uses: f64,
    pub weight: f64,
    pub place: Option<[f64; 3]>,
    pub vector: Option<Vec<f32>>,
    pub norm: f32,
    pub tokens: Vec<String>,
    pub tf: HashMap<String, u32>,
}

impl Item {
    #[allow(clippy::too_many_arguments)]
    pub fn new(id: u32, scope: u32, kind: u8, created: f64, text: &str) -> Item {
        let tokens = tokenize(text);
        let mut tf = HashMap::new();
        for t in &tokens {
            *tf.entry(t.clone()).or_insert(0) += 1;
        }
        Item {
            id,
            scope,
            kind,
            created,
            last_used: created,
            importance: 0.4,
            arousal: 0.0,
            valence: 0.0,
            novelty: 0.0,
            uses: 0.0,
            weight: 1.0,
            place: None,
            vector: None,
            norm: 0.0,
            tokens,
            tf,
        }
    }

    pub fn set_vector(&mut self, v: Vec<f32>) {
        self.norm = dot(&v, &v).sqrt();
        self.vector = Some(v);
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Scorer {
    Linear,
    Organic,
}

#[derive(Clone, Debug)]
pub struct Params {
    pub k1: f64,
    pub b: f64,
    pub rrf_k: f64,
    pub cand: usize,
    pub k: usize,
    pub now: f64,
    pub scorer: Scorer,
    pub w_rel: f64,
    pub w_rec: f64,
    pub w_imp: f64,
    pub tau_h: f64,
    pub vec_floor: f64,
    pub valence: f64,
    pub place: Option<[f64; 3]>,
    pub kinds: u32,
    pub scopes: Vec<u32>,
}

impl Default for Params {
    fn default() -> Params {
        Params {
            k1: 1.4,
            b: 0.75,
            rrf_k: 60.0,
            cand: 18,
            k: 6,
            now: 0.0,
            scorer: Scorer::Linear,
            w_rel: 0.55,
            w_rec: 0.20,
            w_imp: 0.25,
            tau_h: 72.0,
            vec_floor: 0.12,
            valence: 0.0,
            place: None,
            kinds: u32::MAX,
            scopes: Vec::new(),
        }
    }
}

/// One fused candidate with every term the scorers used, for a recall trace.
#[derive(Clone, Debug, PartialEq)]
pub struct Hit {
    pub id: u32,
    /// Rank in the BM25 list, -1 when absent.
    pub bm25_rank: i32,
    /// Rank in the vector list, -1 when absent.
    pub vec_rank: i32,
    pub bm25: f64,
    pub cos: f64,
    pub rrf: f64,
    pub rel: f64,
    pub rec: f64,
    pub imp: f64,
    pub ret: f64,
    pub score: f64,
}

#[derive(Default)]
pub struct Index {
    pub dim: usize,
    pub items: Vec<Item>,
}

impl Index {
    pub fn new(dim: usize) -> Index {
        Index {
            dim,
            items: Vec::new(),
        }
    }

    pub fn position(&self, id: u32) -> Option<usize> {
        self.items.iter().position(|it| it.id == id)
    }

    /// Adds or replaces the item with the same id.
    pub fn upsert(&mut self, item: Item) {
        match self.position(item.id) {
            Some(i) => self.items[i] = item,
            None => self.items.push(item),
        }
    }

    pub fn remove(&mut self, id: u32) -> bool {
        match self.position(id) {
            Some(i) => {
                self.items.remove(i);
                true
            }
            None => false,
        }
    }

    fn admits(&self, it: &Item, p: &Params) -> bool {
        (it.kind < 32 && p.kinds & (1 << it.kind) != 0)
            && (p.scopes.is_empty() || p.scopes.contains(&it.scope))
    }

    pub fn cosine(&self, it: &Item, q: &[f32], qnorm: f32) -> f64 {
        match &it.vector {
            Some(v) if it.norm > 0.0 && qnorm > 0.0 && v.len() == q.len() => {
                dot(v, q) as f64 / (it.norm as f64 * qnorm as f64)
            }
            _ => 0.0,
        }
    }

    /// BM25 scores over the admitted items. Statistics come from the
    /// admitted set only, so a scope sees its own document frequencies.
    pub fn bm25(&self, query: &str, p: &Params) -> Vec<(u32, f64)> {
        let q = tokenize(query);
        let docs: Vec<&Item> = self.items.iter().filter(|it| self.admits(it, p)).collect();
        let n = docs.len() as f64;
        if n == 0.0 || q.is_empty() {
            return Vec::new();
        }
        let avgdl = docs.iter().map(|d| d.tokens.len() as f64).sum::<f64>() / n;
        let mut terms: Vec<&String> = q.iter().collect();
        terms.sort();
        terms.dedup();
        let mut out = Vec::new();
        for d in &docs {
            let dl = d.tokens.len() as f64;
            let mut s = 0.0;
            for t in &terms {
                let tf = *d.tf.get(*t).unwrap_or(&0) as f64;
                if tf == 0.0 {
                    continue;
                }
                let df = docs.iter().filter(|x| x.tf.contains_key(*t)).count() as f64;
                let idf = ln(1.0 + (n - df + 0.5) / (df + 0.5));
                let norm = if avgdl > 0.0 { dl / avgdl } else { 0.0 };
                s += idf * tf * (p.k1 + 1.0) / (tf + p.k1 * (1.0 - p.b + p.b * norm));
            }
            if s > 0.0 {
                out.push((d.id, s));
            }
        }
        out
    }

    /// Hybrid recall: BM25 top cand and cosine top cand (over the floor),
    /// fused by reciprocal rank, then scored. Ties break on id.
    pub fn recall(&self, query: &str, qvec: Option<&[f32]>, p: &Params) -> Vec<Hit> {
        let mut sparse = self.bm25(query, p);
        sparse.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        sparse.truncate(p.cand);

        let mut dense: Vec<(u32, f64)> = Vec::new();
        let mut cos_of: HashMap<u32, f64> = HashMap::new();
        if let Some(q) = qvec {
            let qn = dot(q, q).sqrt();
            for it in self.items.iter().filter(|it| self.admits(it, p)) {
                let c = self.cosine(it, q, qn);
                cos_of.insert(it.id, c);
                if c > p.vec_floor {
                    dense.push((it.id, c));
                }
            }
            dense.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
            dense.truncate(p.cand);
        }

        let mut order: Vec<u32> = Vec::new();
        let mut fused: HashMap<u32, Hit> = HashMap::new();
        for (list, is_sparse) in [(&sparse, true), (&dense, false)] {
            for (r, (id, s)) in list.iter().enumerate() {
                let h = fused.entry(*id).or_insert_with(|| {
                    order.push(*id);
                    Hit {
                        id: *id,
                        bm25_rank: -1,
                        vec_rank: -1,
                        bm25: 0.0,
                        cos: 0.0,
                        rrf: 0.0,
                        rel: 0.0,
                        rec: 0.0,
                        imp: 0.0,
                        ret: 0.0,
                        score: 0.0,
                    }
                });
                h.rrf += 1.0 / (p.rrf_k + r as f64 + 1.0);
                if is_sparse {
                    h.bm25_rank = r as i32;
                    h.bm25 = *s;
                } else {
                    h.vec_rank = r as i32;
                    h.cos = *s;
                }
            }
        }
        if order.is_empty() {
            return Vec::new();
        }
        let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
        for id in &order {
            let r = fused[id].rrf;
            lo = lo.min(r);
            hi = hi.max(r);
        }
        let mut hits: Vec<Hit> = Vec::with_capacity(order.len());
        for id in order {
            let mut h = fused.remove(&id).unwrap_or_else(|| unreachable!());
            let it = &self.items[self.position(id).unwrap_or_else(|| unreachable!())];
            if h.vec_rank < 0 {
                h.cos = *cos_of.get(&id).unwrap_or(&0.0);
            }
            h.rel = if hi > lo {
                (h.rrf - lo) / (hi - lo)
            } else {
                1.0
            };
            h.rec = exp(-(p.now - it.last_used).max(0.0) / p.tau_h);
            h.imp = it.importance;
            h.ret = retention(it.kind, p.now - it.last_used, it.uses);
            h.score = match p.scorer {
                Scorer::Linear => p.w_rel * h.rel + p.w_rec * h.rec + p.w_imp * h.imp,
                Scorer::Organic => organic(it, &h, p),
            } * it.weight;
            hits.push(h);
        }
        hits.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.id.cmp(&b.id)));
        hits.truncate(p.k);
        hits
    }

    /// Strengthen on recall: one more use, weight up 0.02 to at most 1.2.
    pub fn touch(&mut self, id: u32, now: f64) -> bool {
        match self.position(id) {
            Some(i) => {
                let it = &mut self.items[i];
                it.uses += 1.0;
                it.weight = (it.weight + 0.02).min(1.2);
                it.last_used = it.last_used.max(now);
                true
            }
            None => false,
        }
    }

    /// The best near duplicate of a new text in the same kind and scope:
    /// equal token lists within window_h hours, or cosine at or above
    /// threshold. Returns the id.
    #[allow(clippy::too_many_arguments)]
    pub fn find_dup(
        &self,
        text: &str,
        vec: Option<&[f32]>,
        kind: u8,
        scope: u32,
        now: f64,
        window_h: f64,
        threshold: f64,
    ) -> Option<u32> {
        let toks = tokenize(text);
        let qn = vec.map(|v| dot(v, v).sqrt()).unwrap_or(0.0);
        let mut best: Option<(u32, f64)> = None;
        for it in self
            .items
            .iter()
            .filter(|it| it.kind == kind && it.scope == scope)
        {
            let mut s = -1.0;
            if !toks.is_empty() && it.tokens == toks && (now - it.created).abs() <= window_h {
                s = 2.0;
            } else if let Some(q) = vec {
                let c = self.cosine(it, q, qn);
                if c >= threshold {
                    s = c;
                }
            }
            if s >= 0.0 && best.is_none_or(|(bid, bs)| s > bs || (s == bs && it.id < bid)) {
                best = Some((it.id, s));
            }
        }
        best.map(|b| b.0)
    }

    /// Folds drop into keep: uses add plus one, importance and weight take
    /// the larger, last use the later. drop is removed.
    pub fn merge(&mut self, keep: u32, drop: u32) -> bool {
        let (Some(ki), Some(di)) = (self.position(keep), self.position(drop)) else {
            return false;
        };
        if ki == di {
            return false;
        }
        let d = self.items[di].clone();
        let k = &mut self.items[ki];
        k.uses += d.uses + 1.0;
        k.importance = k.importance.max(d.importance);
        k.weight = k.weight.max(d.weight);
        k.last_used = k.last_used.max(d.last_used);
        k.created = k.created.min(d.created);
        self.items.remove(di);
        true
    }

    /// Merges every pair in the same kind and scope whose cosine is at or
    /// above threshold, keeping the older item. Returns (kept, dropped) pairs.
    pub fn merge_near(&mut self, threshold: f64) -> Vec<(u32, u32)> {
        let mut pairs = Vec::new();
        let mut i = 0;
        'outer: while i < self.items.len() {
            let mut j = i + 1;
            while j < self.items.len() {
                let (a, b) = (&self.items[i], &self.items[j]);
                let same = a.kind == b.kind && a.scope == b.scope;
                let c = match (&a.vector, same) {
                    (Some(av), true) => self.cosine(b, av, a.norm),
                    _ => 0.0,
                };
                if same && c >= threshold {
                    let a_older = (a.created, a.id) <= (b.created, b.id);
                    let (keep, drop) = if a_older { (a.id, b.id) } else { (b.id, a.id) };
                    self.merge(keep, drop);
                    pairs.push((keep, drop));
                    if !a_older {
                        continue 'outer;
                    }
                    continue;
                }
                j += 1;
            }
            i += 1;
        }
        pairs
    }

    /// Drops items whose retention at now is below floor. Returns their ids.
    pub fn decay(&mut self, now: f64, floor: f64) -> Vec<u32> {
        let mut gone = Vec::new();
        self.items.retain(|it| {
            let keep = retention(it.kind, now - it.last_used, it.uses) >= floor;
            if !keep {
                gone.push(it.id);
            }
            keep
        });
        gone
    }
}

/// The organic scorer: similarity, retention stretched by importance,
/// emotion and use, emotion, novelty, place, mood and recent use.
fn organic(it: &Item, h: &Hit, p: &Params) -> f64 {
    let sim = if it.vector.is_some() && h.cos > 0.0 {
        h.cos
    } else {
        h.rel
    };
    let emo = 0.5 * it.arousal + 0.5 * it.valence.abs();
    let half = 4.0 + 30.0 * it.importance + 20.0 * emo + 8.0 * it.uses.min(5.0);
    let ret = exp(-(p.now - it.created).max(0.0) / half);
    let ctx = match (p.place, it.place) {
        (Some(a), Some(b)) => {
            let d = ((a[0] - b[0]) * (a[0] - b[0])
                + (a[1] - b[1]) * (a[1] - b[1])
                + (a[2] - b[2]) * (a[2] - b[2]))
                .sqrt();
            0.08 * exp(-d / 2.5)
        }
        _ => 0.0,
    };
    let mood = 0.05 * (1.0 - (it.valence - p.valence).abs() / 2.0);
    let ru = if it.uses > 0.0 {
        0.04 * exp(-(p.now - it.last_used).max(0.0) / 24.0)
    } else {
        0.0
    };
    0.6 * sim + 0.18 * ret + 0.06 * emo + 0.05 * it.novelty + ctx + mood + ru
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: u32, kind: u8, t: f64, text: &str, v: &[f32]) -> Item {
        let mut it = Item::new(id, 0, kind, t, text);
        it.set_vector(v.to_vec());
        it
    }

    #[test]
    fn bm25_ranks_the_matching_doc_first() {
        let mut ix = Index::new(4);
        ix.upsert(item(
            1,
            KIND_FACT,
            0.0,
            "the mug lives on the shelf",
            &[1.0, 0.0, 0.0, 0.0],
        ));
        ix.upsert(item(
            2,
            KIND_FACT,
            0.0,
            "the dog sleeps by the door",
            &[0.0, 1.0, 0.0, 0.0],
        ));
        let p = Params::default();
        let s = ix.bm25("where is the mug", &p);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].0, 1);
    }

    #[test]
    fn rrf_fuses_keyword_and_vector_hits() {
        let mut ix = Index::new(4);
        ix.upsert(item(1, KIND_FACT, 0.0, "mug shelf", &[1.0, 0.0, 0.0, 0.0]));
        ix.upsert(item(
            2,
            KIND_FACT,
            0.0,
            "cup cupboard",
            &[0.9, 0.1, 0.0, 0.0],
        ));
        ix.upsert(item(3, KIND_FACT, 0.0, "dog door", &[0.0, 0.0, 1.0, 0.0]));
        let p = Params {
            now: 1.0,
            ..Params::default()
        };
        let hits = ix.recall("mug", Some(&[1.0, 0.0, 0.0, 0.0]), &p);
        assert_eq!(hits[0].id, 1);
        assert_eq!(hits[0].bm25_rank, 0);
        assert_eq!(hits[0].vec_rank, 0);
        assert!((hits[0].rrf - 2.0 / 61.0).abs() < 1e-15);
        assert_eq!(hits[1].id, 2);
        assert_eq!(hits[1].bm25_rank, -1);
        assert!(hits.iter().all(|h| h.id != 3));
    }

    #[test]
    fn scopes_and_kinds_filter() {
        let mut ix = Index::new(0);
        let mut a = Item::new(1, 7, KIND_EPISODE, 0.0, "red ball");
        a.scope = 7;
        ix.upsert(a);
        ix.upsert(Item::new(2, 0, KIND_FACT, 0.0, "red ball"));
        let p = Params {
            scopes: vec![7],
            ..Params::default()
        };
        assert_eq!(
            ix.recall("ball", None, &p)
                .iter()
                .map(|h| h.id)
                .collect::<Vec<_>>(),
            vec![1]
        );
        let p = Params {
            kinds: 1 << KIND_FACT,
            ..Params::default()
        };
        assert_eq!(
            ix.recall("ball", None, &p)
                .iter()
                .map(|h| h.id)
                .collect::<Vec<_>>(),
            vec![2]
        );
    }

    #[test]
    fn retention_halves_at_half_life_and_uses_stretch_it() {
        assert!((retention(KIND_EPISODE, 6.0, 0.0) - 0.5).abs() < 1e-12);
        assert!((retention(KIND_EPISODE, 9.0, 1.0) - 0.5).abs() < 1e-12);
        assert_eq!(retention(KIND_RULE, 1e6, 0.0), 1.0);
    }

    #[test]
    fn decay_drops_old_episodes_and_keeps_rules() {
        let mut ix = Index::new(0);
        ix.upsert(Item::new(1, 0, KIND_EPISODE, 0.0, "old"));
        ix.upsert(Item::new(2, 0, KIND_RULE, 0.0, "rule"));
        ix.upsert(Item::new(3, 0, KIND_FACT, 0.0, "fact"));
        assert_eq!(ix.decay(60.0, 0.05), vec![1]);
        assert_eq!(ix.items.len(), 2);
    }

    #[test]
    fn touch_strengthens_to_a_cap() {
        let mut ix = Index::new(0);
        ix.upsert(Item::new(1, 0, KIND_FACT, 0.0, "x"));
        for _ in 0..20 {
            ix.touch(1, 5.0);
        }
        let it = &ix.items[0];
        assert_eq!(it.uses, 20.0);
        assert_eq!(it.weight, 1.2);
        assert_eq!(it.last_used, 5.0);
    }

    #[test]
    fn find_dup_and_merge() {
        let mut ix = Index::new(2);
        ix.upsert(item(1, KIND_EPISODE, 0.0, "saw the red ball", &[1.0, 0.0]));
        ix.upsert(item(2, KIND_EPISODE, 0.0, "other thing", &[0.0, 1.0]));
        assert_eq!(
            ix.find_dup(
                "Saw the red ball.",
                None,
                KIND_EPISODE,
                0,
                0.01,
                60.0 / 3600.0,
                0.93
            ),
            Some(1)
        );
        assert_eq!(
            ix.find_dup(
                "Saw the red ball.",
                None,
                KIND_EPISODE,
                0,
                1.0,
                60.0 / 3600.0,
                0.93
            ),
            None
        );
        assert_eq!(
            ix.find_dup("x", Some(&[0.1, 0.99]), KIND_EPISODE, 0, 9.0, 0.0, 0.93),
            Some(2)
        );
        assert_eq!(
            ix.find_dup("x", Some(&[0.1, 0.99]), KIND_FACT, 0, 9.0, 0.0, 0.93),
            None
        );
        ix.items[1].importance = 0.9;
        assert!(ix.merge(1, 2));
        assert_eq!(ix.items.len(), 1);
        assert_eq!(ix.items[0].uses, 1.0);
        assert_eq!(ix.items[0].importance, 0.9);
    }

    #[test]
    fn merge_near_keeps_the_older_item() {
        let mut ix = Index::new(2);
        ix.upsert(item(5, KIND_FACT, 3.0, "a", &[1.0, 0.0]));
        ix.upsert(item(6, KIND_FACT, 1.0, "b", &[1.0, 0.01]));
        ix.upsert(item(7, KIND_FACT, 2.0, "c", &[0.0, 1.0]));
        assert_eq!(ix.merge_near(0.95), vec![(6, 5)]);
        assert_eq!(
            ix.items.iter().map(|i| i.id).collect::<Vec<_>>(),
            vec![6, 7]
        );
    }

    #[test]
    fn organic_prefers_emotional_and_near_memories() {
        let mut ix = Index::new(2);
        let mut a = item(1, KIND_EPISODE, 0.0, "ball", &[1.0, 0.0]);
        a.arousal = 0.9;
        a.place = Some([0.0, 0.0, 0.0]);
        let mut b = item(2, KIND_EPISODE, 0.0, "ball", &[1.0, 0.0]);
        b.place = Some([9.0, 0.0, 0.0]);
        ix.upsert(a);
        ix.upsert(b);
        let p = Params {
            scorer: Scorer::Organic,
            now: 2.0,
            place: Some([0.0, 0.0, 0.0]),
            ..Params::default()
        };
        let hits = ix.recall("ball", Some(&[1.0, 0.0]), &p);
        assert_eq!(hits[0].id, 1);
        assert!(hits[0].score > hits[1].score);
    }
}
