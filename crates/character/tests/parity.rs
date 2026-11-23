//! Native half of the native and wasm parity check. Each case runs one
//! operation of the shared surface (`ops`) on fixture bytes; inputs and
//! native outputs go to tests/parity.json as base64, and
//! packages/character/test/parity.test.ts runs the wasm build over the
//! same inputs and expects the same bytes. This test also fails when the
//! stored file no longer matches the native build. Regenerate with
//! UPDATE_PARITY=1 cargo test -p hackbuild-character --test parity.

use hackbuild_character::bytes::{b64_encode, crc32};
use hackbuild_character::{charx_entry, ops, png};

const WREN: &str = include_str!("fixtures/wren.v2.json");
const PELL: &str = include_str!("fixtures/pell.v3.json");
const MOSS: &str = include_str!("fixtures/odd.v1.json");
const LOOSE: &str = include_str!("fixtures/loose.profile.json");

/// zlib.deflateRawSync output (Node 22.18.0, level 9) for `deflated_text`.
const DEFLATED: &[u8] = &[
    0xed, 0x8e, 0x4b, 0x0e, 0xc2, 0x30, 0x0c, 0x44, 0xaf, 0xe2, 0x03, 0x20, 0xc4, 0xa7, 0xfc, 0x8e,
    0xe3, 0xa6, 0xa6, 0x09, 0x49, 0xda, 0x60, 0x3b, 0x0d, 0xe5, 0xf4, 0x88, 0x96, 0x4d, 0x57, 0xac,
    0xd8, 0xb1, 0x9c, 0xd1, 0xd3, 0xcc, 0x53, 0x4b, 0xe0, 0x89, 0x12, 0x31, 0x98, 0xe0, 0x62, 0x2d,
    0xa0, 0x96, 0x40, 0x14, 0x1d, 0x03, 0x2a, 0x34, 0x59, 0xfc, 0x7a, 0xaa, 0x3e, 0x90, 0xb2, 0x8b,
    0x33, 0x53, 0x9c, 0xf1, 0x4b, 0x24, 0x60, 0x4c, 0xa0, 0x99, 0x3b, 0x59, 0x7d, 0xc9, 0xd0, 0x0f,
    0xef, 0x2d, 0x4b, 0xd0, 0x32, 0x8d, 0x50, 0x50, 0x89, 0xa1, 0x58, 0x17, 0x68, 0x2a, 0x0d, 0x2a,
    0x48, 0x20, 0x4a, 0x02, 0x7d, 0x37, 0x9f, 0x21, 0x47, 0x68, 0x03, 0x8a, 0x2c, 0x6c, 0xfe, 0xca,
    0x3f, 0x53, 0xde, 0x6c, 0x77, 0xfb, 0xea, 0x70, 0x3c, 0x9d, 0x2f, 0x58, 0x9b, 0x86, 0xae, 0xad,
    0x75, 0x37, 0x1f, 0x62, 0xd7, 0xa7, 0x3b, 0x8b, 0xe6, 0xa1, 0x3c, 0xc6, 0xe7, 0x0b,
];

fn deflated_text() -> Vec<u8> {
    let line = "the keeper climbs the stair at dusk. the keeper trims the wick at dusk. the lamp turns, the lamp turns, the lamp turns over the grey water while the cat sleeps on the warm glass. ";
    let mut t = line.repeat(3);
    t.push_str("0123456789abcdefghijklmnopqrstuvwxyz");
    t.into_bytes()
}

/// A CHARX made by hand with card.json stored and one deflated entry,
/// the way zip tools other than this crate write them.
fn deflated_charx() -> Vec<u8> {
    let files: Vec<(&str, u16, Vec<u8>, Vec<u8>)> = vec![
        (
            "card.json",
            0,
            PELL.as_bytes().to_vec(),
            PELL.as_bytes().to_vec(),
        ),
        (
            "assets/other/notes.txt",
            8,
            DEFLATED.to_vec(),
            deflated_text(),
        ),
    ];
    let mut out = Vec::new();
    let mut cd = Vec::new();
    for (name, method, data, plain) in &files {
        let off = out.len() as u32;
        let fields = |v: &mut Vec<u8>| {
            v.extend_from_slice(&20u16.to_le_bytes());
            v.extend_from_slice(&0u16.to_le_bytes());
            v.extend_from_slice(&method.to_le_bytes());
            v.extend_from_slice(&[0, 0, 0x21, 0]);
            v.extend_from_slice(&crc32(plain).to_le_bytes());
            v.extend_from_slice(&(data.len() as u32).to_le_bytes());
            v.extend_from_slice(&(plain.len() as u32).to_le_bytes());
            v.extend_from_slice(&(name.len() as u16).to_le_bytes());
            v.extend_from_slice(&0u16.to_le_bytes());
        };
        out.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        fields(&mut out);
        out.extend_from_slice(name.as_bytes());
        out.extend_from_slice(data);
        cd.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        cd.extend_from_slice(&20u16.to_le_bytes());
        fields(&mut cd);
        cd.extend_from_slice(&[0; 10]);
        cd.extend_from_slice(&off.to_le_bytes());
        cd.extend_from_slice(name.as_bytes());
    }
    let at = out.len() as u32;
    out.extend_from_slice(&cd);
    out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    out.extend_from_slice(&[0, 0, 0, 0, 2, 0, 2, 0]);
    out.extend_from_slice(&(cd.len() as u32).to_le_bytes());
    out.extend_from_slice(&at.to_le_bytes());
    out.extend_from_slice(&[0, 0]);
    out
}

fn pack(files: &[(&str, Vec<u8>)]) -> Vec<u8> {
    let mut b = Vec::new();
    for (n, d) in files {
        b.extend_from_slice(&(n.len() as u32).to_le_bytes());
        b.extend_from_slice(n.as_bytes());
        b.extend_from_slice(&(d.len() as u32).to_le_bytes());
        b.extend_from_slice(d);
    }
    b
}

struct Case {
    op: &'static str,
    a: Vec<u8>,
    b: Vec<u8>,
    n: u32,
    res: Result<Vec<u8>, String>,
}

fn cases() -> Vec<Case> {
    let base = png::blank(3, 2, [90, 120, 150]);
    let wren_png = ops::write_png(&[], WREN.as_bytes(), 0).unwrap();
    let charx = ops::write_charx(
        PELL.as_bytes(),
        &pack(&[
            ("assets/avatar/pell.glb", vec![1, 2, 3, 4]),
            ("assets/voice/ref.wav", vec![9; 16]),
        ]),
        true,
    )
    .unwrap();
    let dz = deflated_charx();
    let mut out = Vec::new();
    let mut add =
        |op: &'static str, a: Vec<u8>, b: Vec<u8>, n: u32, res: Result<Vec<u8>, String>| {
            out.push(Case { op, a, b, n, res })
        };
    for card in [WREN, PELL, MOSS] {
        let c = card.as_bytes().to_vec();
        add("read", c.clone(), vec![], 0, ops::read(&c));
        add("upgrade", c.clone(), vec![], 0, ops::upgrade(&c));
        add("downgrade", c.clone(), vec![], 0, ops::downgrade(&c));
        add("validate", c.clone(), vec![], 0, ops::validate(&c));
        add("migrate", c.clone(), vec![], 1, ops::migrate(&c, true));
        for mode in 0..3 {
            add(
                "write_png",
                base.clone(),
                c.clone(),
                mode,
                ops::write_png(&base, &c, mode),
            );
        }
    }
    add(
        "write_png",
        vec![],
        WREN.as_bytes().to_vec(),
        0,
        ops::write_png(&[], WREN.as_bytes(), 0),
    );
    add("read", wren_png.clone(), vec![], 0, ops::read(&wren_png));
    add("read", charx.clone(), vec![], 0, ops::read(&charx));
    add("read", dz.clone(), vec![], 0, ops::read(&dz));
    add(
        "entry",
        dz.clone(),
        b"assets/other/notes.txt".to_vec(),
        0,
        charx_entry(&dz, "assets/other/notes.txt"),
    );
    add(
        "entry",
        charx.clone(),
        b"assets/voice/ref.wav".to_vec(),
        0,
        charx_entry(&charx, "assets/voice/ref.wav"),
    );
    let p = pack(&[("assets/icon/main.png", base.clone())]);
    add(
        "write_charx",
        WREN.as_bytes().to_vec(),
        p.clone(),
        1,
        ops::write_charx(WREN.as_bytes(), &p, true),
    );
    add(
        "write_charx",
        WREN.as_bytes().to_vec(),
        p.clone(),
        0,
        ops::write_charx(WREN.as_bytes(), &p, false),
    );
    add(
        "migrate_profile",
        LOOSE.as_bytes().to_vec(),
        vec![],
        0,
        ops::migrate_profile(LOOSE.as_bytes()),
    );
    add(
        "read",
        b"{\"spec\":".to_vec(),
        vec![],
        0,
        ops::read(b"{\"spec\":"),
    );
    add(
        "upgrade",
        b"{\"spec\":\"other\"}".to_vec(),
        vec![],
        0,
        ops::upgrade(b"{\"spec\":\"other\"}"),
    );
    out
}

fn render() -> String {
    let mut s = String::from("{\"cases\":[\n");
    for (i, c) in cases().iter().enumerate() {
        if i > 0 {
            s.push_str(",\n");
        }
        let (code, out) = match &c.res {
            Ok(b) => (0, b.clone()),
            Err(e) => (1, e.clone().into_bytes()),
        };
        s.push_str(&format!(
            "{{\"op\":\"{}\",\"n\":{},\"code\":{},\"a\":\"{}\",\"b\":\"{}\",\"out\":\"{}\"}}",
            c.op,
            c.n,
            code,
            b64_encode(&c.a),
            b64_encode(&c.b),
            b64_encode(&out)
        ));
    }
    s.push_str("\n]}\n");
    s
}

#[test]
fn parity_fixture_matches_native() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/parity.json");
    let now = render();
    if std::env::var("UPDATE_PARITY").is_ok() {
        std::fs::write(path, &now).unwrap();
    }
    let stored =
        std::fs::read_to_string(path).expect("tests/parity.json missing; run with UPDATE_PARITY=1");
    assert!(
        stored == now,
        "tests/parity.json differs from the native build; rerun with UPDATE_PARITY=1 and rebuild the wasm"
    );
}

#[test]
fn deflated_charx_reads() {
    let dz = deflated_charx();
    assert_eq!(
        charx_entry(&dz, "assets/other/notes.txt").unwrap(),
        deflated_text()
    );
    let r = hackbuild_character::read(&dz).unwrap();
    assert_eq!(
        r.assets,
        vec![("assets/other/notes.txt".to_string(), deflated_text().len())]
    );
}
