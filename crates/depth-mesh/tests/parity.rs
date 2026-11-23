//! Native half of the native and wasm parity check, plus end to end checks
//! of the fixtures: a sphere depth map through the cloud, relief and
//! heightfield mesh, ICP of the cloud against itself after a known motion,
//! and carving of a box from 12 turntable silhouettes. Hashes (FNV-1a 64
//! over the bit patterns) go to tests/parity.json;
//! packages/depth-mesh/test/parity.test.ts asserts the same bits from the
//! wasm build. Regenerate with UPDATE_PARITY=1 cargo test -p
//! hackbuild-depth-mesh --test parity.

use hackbuild_depth_mesh::{carve, cloud, icp, math, nets, relief, synth};
use std::fmt::Write;

fn fnv(bytes: impl Iterator<Item = u8>) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}
fn hf(x: &[f32]) -> String {
    fnv(x.iter().flat_map(|v| v.to_bits().to_le_bytes()))
}
fn hu(x: &[u32]) -> String {
    fnv(x.iter().flat_map(|v| v.to_le_bytes()))
}

pub const TT: carve::Turntable = carve::Turntable {
    width: 80,
    height: 60,
    focal: 90.0,
    dist: 2.5,
    half: 0.6,
};

fn build() -> String {
    let mut s = String::from("{\n");
    let (w, h) = (96usize, 72usize);
    let depth = synth::sphere_depth(w, h);
    writeln!(s, "\"depth\":\"{}\",", hf(&depth)).unwrap();
    let cp = cloud::CloudParams {
        near: 0.3,
        far: 1.2,
        focal: 80.0,
        stride: 2,
        dmin: 0.0,
        dmax: 1.0,
    };
    let (pos, nor) = cloud::build_cloud(&depth, w, h, &cp);
    writeln!(
        s,
        "\"cloud\":[{},\"{}\",\"{}\"],",
        pos.len() / 3,
        hf(&pos),
        hf(&nor)
    )
    .unwrap();
    let rp = relief::ReliefParams {
        base: 0.4,
        height: 2.4,
        gamma: 1.2,
        bgcut: 0.1,
        invert: false,
    };
    let mut hts = relief::heights(&depth, None, &rp);
    let healed = relief::heal_pinches(&mut hts, w, h);
    let m = relief::heightfield_mesh(&hts, w, h, 0.25, -12.0, -9.0, 1.0);
    writeln!(
        s,
        "\"relief\":[\"{}\",{healed},{},\"{}\",\"{}\"],",
        hf(&hts),
        m.indices.len() / 3,
        hf(&m.positions),
        hu(&m.indices)
    )
    .unwrap();
    let d = 16;
    let field: Vec<f32> = (0..d * d * d)
        .map(|i| {
            let (x, y, z) = (
                (i % d) as f32 - 7.5,
                ((i / d) % d) as f32 - 7.5,
                (i / (d * d)) as f32 - 7.5,
            );
            5.0 - (x * x + y * y * 1.5 + z * z).sqrt()
        })
        .collect();
    let mut f2 = field.clone();
    nets::blur_pass(&mut f2, d, d, d);
    let (v, t) = nets::surface_nets(&f2, d, d, d);
    writeln!(
        s,
        "\"nets\":[{},\"{}\",\"{}\"],",
        t.len() / 3,
        hf(&v),
        hu(&t)
    )
    .unwrap();
    let mut model = icp::Model::new(0.01, 200_000);
    model.integrate(&pos, &nor, &icp::IDENTITY);
    let start = (icp::rodrigues([0.0, 0.03, 0.0]), [0.01, 0.0, 0.0]);
    let (pose, inl, err) = model.icp(&pos, &nor, &start, 1, 12, 0.03, 0.5);
    let pv: Vec<f64> = pose
        .0
        .iter()
        .chain(pose.1.iter())
        .copied()
        .chain([inl as f64, err])
        .collect();
    let ps: Vec<String> = pv.iter().map(|x| format!("{x:?}")).collect();
    writeln!(s, "\"icp\":[{}],", ps.join(",")).unwrap();
    writeln!(s, "\"modelLen\":{},", model.map.len()).unwrap();
    let angles: Vec<f64> = (0..12).map(|k| k as f64 * math::PI / 6.0).collect();
    let mut masks = Vec::new();
    for &a in &angles {
        masks.extend(synth::box_silhouette(a, [0.3, 0.45, 0.2], &TT));
    }
    writeln!(s, "\"masks\":\"{}\",", fnv(masks.iter().copied())).unwrap();
    let (cv, ct) = carve::carve(&masks, &angles, 24, 1, &TT);
    writeln!(
        s,
        "\"carve\":[{},\"{}\",\"{}\"],",
        ct.len() / 3,
        hf(&cv),
        hu(&ct)
    )
    .unwrap();
    let r = icp::rodrigues([0.1, -0.2, 0.3]);
    let rs: Vec<String> = r.iter().map(|x| format!("{x:?}")).collect();
    writeln!(s, "\"rodrigues\":[{}]", rs.join(",")).unwrap();
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
fn icp_returns_to_identity_and_carving_finds_the_box() {
    let depth = synth::sphere_depth(96, 72);
    let cp = cloud::CloudParams {
        near: 0.3,
        far: 1.2,
        focal: 80.0,
        stride: 2,
        dmin: 0.0,
        dmax: 1.0,
    };
    let (pos, nor) = cloud::build_cloud(&depth, 96, 72, &cp);
    let mut model = icp::Model::new(0.01, 200_000);
    model.integrate(&pos, &nor, &icp::IDENTITY);
    let start = (icp::rodrigues([0.0, 0.03, 0.0]), [0.01, 0.0, 0.0]);
    let (pose, _, err) = model.icp(&pos, &nor, &start, 1, 12, 0.03, 0.5);
    assert!(icp::rot_angle(&pose.0, &icp::IDENTITY.0) < 0.01, "angle");
    assert!(pose.1.iter().all(|t| t.abs() < 0.005), "{:?}", pose.1);
    assert!(err < 0.01);

    let angles: Vec<f64> = (0..12).map(|k| k as f64 * math::PI / 6.0).collect();
    let mut masks = Vec::new();
    for &a in &angles {
        masks.extend(synth::box_silhouette(a, [0.3, 0.45, 0.2], &TT));
    }
    let (v, t) = carve::carve(&masks, &angles, 32, 1, &TT);
    assert!(t.len() > 100);
    let ext = |k: usize| {
        v.iter()
            .skip(k)
            .step_by(3)
            .fold(0f32, |m, x| m.max(x.abs()))
    };
    // the hull of a box from silhouettes is the box with its vertical edges carved, within a voxel or two
    assert!((ext(1) - 0.45).abs() < 0.08, "y {}", ext(1));
    assert!(ext(0) < 0.42 && ext(0) > 0.25, "x {}", ext(0));
    assert!(ext(2) < 0.42 && ext(2) > 0.15, "z {}", ext(2));
}
