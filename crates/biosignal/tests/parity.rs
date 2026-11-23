//! Native half of the native and wasm parity check, plus end to end checks:
//! a seeded two class fixture filtered, turned into covariances, tangent
//! vectors, a trained model's probabilities and grouped cross validation.
//! Regenerate tests/parity.json with UPDATE_PARITY=1 cargo test -p
//! hackbuild-biosignal --test parity.

use hackbuild_biosignal::{classify, filters, riemann};
use std::fmt::Write;

fn fnv(x: &[f32]) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for v in x {
        for b in v.to_bits().to_le_bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    format!("{h:016x}")
}
fn nums(x: &[f64]) -> String {
    x.iter()
        .map(|v| format!("{v:?}"))
        .collect::<Vec<_>>()
        .join(",")
}

const C: usize = 4;
const T: usize = 128;
const FS: f64 = 128.0;

/// Windows, labels, trial ids, and one band of covariances per window.
type Data = (Vec<f32>, Vec<usize>, Vec<u32>, Vec<Vec<Vec<f64>>>);

fn dataset() -> Data {
    let (x, y, tr) = classify::synth_epochs(7, C, T, FS, 10.0, 20, 3);
    let covs = (0..y.len())
        .map(|i| {
            let w = &x[i * C * T..(i + 1) * C * T];
            let f: Vec<f32> = (0..C)
                .flat_map(|ch| {
                    filters::bandpass_zero_phase(&w[ch * T..(ch + 1) * T], FS, 8.0, 12.0, 50.0)
                })
                .collect();
            vec![riemann::covariance(&f, C, T, 0.08)]
        })
        .collect();
    (x, y, tr, covs)
}

fn build() -> String {
    let (x, y, tr, covs) = dataset();
    let mut s = String::from("{\n");
    writeln!(s, "\"x\":\"{}\",", fnv(&x)).unwrap();
    let f = filters::bandpass_zero_phase(&x[..T], FS, 8.0, 12.0, 50.0);
    writeln!(s, "\"filtered\":\"{}\",", fnv(&f)).unwrap();
    writeln!(s, "\"cov0\":[{}],", nums(&covs[0][0])).unwrap();
    let p = riemann::invsqrtm(&covs[1][0], C);
    writeln!(
        s,
        "\"tangent\":[{}],",
        nums(&riemann::tangent(&covs[0][0], &p, C))
    )
    .unwrap();
    writeln!(
        s,
        "\"distance\":{:?},",
        riemann::distance(&covs[0][0], &covs[1][0], C)
    )
    .unwrap();
    let m = classify::fit(
        &covs,
        &y,
        2,
        C,
        &classify::Params {
            l2: 0.05,
            epochs: 60,
            lr: 0.14,
        },
    );
    writeln!(s, "\"proba\":[{}],", nums(&m.proba(&covs[5]))).unwrap();
    let acc = classify::cross_validate(
        &covs,
        &y,
        &tr,
        2,
        C,
        5,
        true,
        11,
        &classify::Params {
            l2: 0.05,
            epochs: 60,
            lr: 0.14,
        },
    );
    writeln!(s, "\"cv\":[{}]", nums(&acc)).unwrap();
    s.push_str("}\n");
    s
}

#[test]
fn parity_fixture_matches() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/parity.json");
    let got = build();
    if std::env::var("UPDATE_PARITY").is_ok() {
        std::fs::write(path, &got).unwrap();
    }
    let want = std::fs::read_to_string(path).expect("run with UPDATE_PARITY=1 once");
    assert_eq!(
        got, want,
        "native output moved; regenerate and check the wasm side"
    );
}

#[test]
fn separates_the_rhythm_and_folds_by_trial() {
    let (_, y, tr, covs) = dataset();
    let acc = classify::cross_validate(&covs, &y, &tr, 2, C, 5, true, 11, &classify::DEFAULT);
    let mean = acc.iter().sum::<f64>() / acc.len() as f64;
    assert!(mean > 0.85, "{acc:?}");
    let f = classify::folds(&tr, 5, true, 3);
    for i in 0..tr.len() {
        for j in 0..tr.len() {
            if tr[i] == tr[j] {
                assert_eq!(f[i], f[j], "a trial split across folds");
            }
        }
    }
    // shuffled labels give chance accuracy
    let ys: Vec<usize> = tr.iter().map(|&t| (t as usize / 2) % 2).collect();
    let bad = classify::cross_validate(&covs, &ys, &tr, 2, C, 5, true, 11, &classify::DEFAULT);
    assert!(bad.iter().sum::<f64>() / 5.0 < 0.75, "{bad:?}");
    let a = &covs[0][0];
    assert!(riemann::distance(a, a, C) < 1e-6);
    let e = riemann::expm(&riemann::logm(a, C), C);
    assert!(e.iter().zip(a).all(|(p, q)| (p - q).abs() < 1e-9));
}
