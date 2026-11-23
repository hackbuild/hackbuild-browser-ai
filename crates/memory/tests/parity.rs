//! Native half of the native and wasm parity check. A seeded corpus and a
//! set of queries are recalled here and written to tests/parity.json with
//! every input; packages/memory/test/parity.test.ts feeds the same inputs
//! to the wasm build and asserts the same bits. Regenerate the file with
//! UPDATE_PARITY=1 cargo test -p hackbuild-memory --test parity.

use hackbuild_memory::index::{Index, Item, Params, Scorer};
use hackbuild_memory::math;
use std::fmt::Write;

/// mulberry32, the seeded generator the TS side also uses elsewhere.
struct Rng(u32);
impl Rng {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b_79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
    fn pick<'a>(&mut self, xs: &[&'a str]) -> &'a str {
        xs[(self.next() * xs.len() as f64) as usize % xs.len()]
    }
}

const WORDS: &[&str] = &[
    "mug", "shelf", "dog", "door", "ball", "kitchen", "window", "rain", "coffee", "bakery",
    "walked", "picked", "dropped", "garden", "lamp", "cables", "printer", "red", "blue", "quiet",
    "loud", "morning", "evening", "friend", "story", "boxes", "running", "tired", "happy", "the",
    "a", "with",
];
const DIM: usize = 13;

fn num(s: &mut String, x: f64) {
    write!(s, "{x:?}").unwrap();
}

fn arr(s: &mut String, xs: &[f64]) {
    s.push('[');
    for (i, x) in xs.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        num(s, *x);
    }
    s.push(']');
}

fn build() -> String {
    let mut rng = Rng(20261122);
    let mut ix = Index::new(DIM);
    let mut out = String::from("{\n\"dim\":13,\n\"items\":[\n");
    for id in 0..48u32 {
        let n = 3 + (rng.next() * 7.0) as usize;
        let text: Vec<&str> = (0..n).map(|_| rng.pick(WORDS)).collect();
        let text = text.join(" ");
        let kind = (rng.next() * 8.0) as u8;
        let scope = (rng.next() * 3.0) as u32;
        let created = (rng.next() * 500.0).floor() / 4.0;
        let mut it = Item::new(id, scope, kind, created, &text);
        it.last_used = created + (rng.next() * 40.0).floor() / 8.0;
        it.importance = rng.next();
        it.arousal = rng.next();
        it.valence = rng.next() * 2.0 - 1.0;
        it.novelty = rng.next();
        it.uses = (rng.next() * 6.0).floor();
        it.weight = 1.0 + (rng.next() * 10.0).floor() / 50.0;
        it.place = if rng.next() < 0.5 {
            Some([rng.next() * 8.0, 0.0, rng.next() * 8.0])
        } else {
            None
        };
        let has_vec = rng.next() < 0.85;
        let v: Vec<f32> = (0..DIM).map(|_| (rng.next() * 2.0 - 1.0) as f32).collect();
        if has_vec {
            it.set_vector(v.clone());
        }
        if id > 0 {
            out.push_str(",\n");
        }
        write!(
            out,
            "{{\"id\":{id},\"scope\":{scope},\"kind\":{kind},\"text\":\"{text}\",\"num\":"
        )
        .unwrap();
        let p = it.place.unwrap_or([0.0; 3]);
        arr(
            &mut out,
            &[
                it.created,
                it.last_used,
                it.importance,
                it.arousal,
                it.valence,
                it.novelty,
                it.uses,
                it.weight,
                if it.place.is_some() { 1.0 } else { 0.0 },
                p[0],
                p[1],
                p[2],
            ],
        );
        out.push_str(",\"vec\":");
        let vv: Vec<f64> = if has_vec {
            v.iter().map(|x| *x as f64).collect()
        } else {
            Vec::new()
        };
        arr(&mut out, &vv);
        out.push('}');
        ix.upsert(it);
    }
    out.push_str("\n],\n\"queries\":[\n");
    for qi in 0..12 {
        let n = 1 + (rng.next() * 3.0) as usize;
        let q: Vec<&str> = (0..n).map(|_| rng.pick(WORDS)).collect();
        let q = q.join(" ");
        let qv: Vec<f32> = (0..DIM).map(|_| (rng.next() * 2.0 - 1.0) as f32).collect();
        let use_vec = qi % 3 != 2;
        let organic = qi % 2 == 1;
        let scopes: Vec<u32> = if qi % 4 == 3 { vec![1, 2] } else { Vec::new() };
        let block = [
            1.4,
            0.75,
            60.0,
            18.0,
            8.0,
            130.0 + qi as f64,
            if organic { 1.0 } else { 0.0 },
            0.55,
            0.2,
            0.25,
            72.0,
            0.05,
            0.3,
            if qi % 5 == 0 { 1.0 } else { 0.0 },
            2.0,
            0.0,
            3.0,
            if qi == 7 {
                0b1011 as f64
            } else {
                u32::MAX as f64
            },
        ];
        let p: Params = hackbuild_memory::params_from(&block, &scopes);
        assert_eq!(
            p.scorer,
            if organic {
                Scorer::Organic
            } else {
                Scorer::Linear
            }
        );
        let hits = ix.recall(&q, if use_vec { Some(&qv) } else { None }, &p);
        let mut flat = Vec::new();
        hackbuild_memory::write_hits(&mut flat, &hits);
        if qi > 0 {
            out.push_str(",\n");
        }
        write!(out, "{{\"q\":\"{q}\",\"vec\":").unwrap();
        let vv: Vec<f64> = if use_vec {
            qv.iter().map(|x| *x as f64).collect()
        } else {
            Vec::new()
        };
        arr(&mut out, &vv);
        out.push_str(",\"params\":");
        arr(&mut out, &block);
        out.push_str(",\"scopes\":");
        arr(
            &mut out,
            &scopes.iter().map(|s| *s as f64).collect::<Vec<_>>(),
        );
        out.push_str(",\"hits\":");
        arr(&mut out, &flat);
        out.push('}');
    }
    out.push_str("\n],\n\"math\":[");
    let xs = [-30.5, -2.25, -0.001, 0.0, 0.3, 1.0, 7.75, 123.456];
    for (i, x) in xs.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        arr(&mut out, &[*x, math::exp(*x), math::ln(x.abs() + 0.5)]);
    }
    out.push_str("]\n}\n");
    out
}

#[test]
fn parity_fixture_is_current() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/parity.json");
    let got = build();
    if std::env::var("UPDATE_PARITY").is_ok() {
        std::fs::write(path, &got).unwrap();
    }
    let want =
        std::fs::read_to_string(path).expect("tests/parity.json missing, run with UPDATE_PARITY=1");
    assert_eq!(
        got, want,
        "native results changed; rerun with UPDATE_PARITY=1 and check the wasm side"
    );
    assert!(
        got.contains("\"hits\":[") && !got.contains("\"hits\":[]}\n],"),
        "fixture has hits"
    );
}
