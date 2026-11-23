//! The native CLI end to end on fixture cards, in a scratch folder under the target dir.

use std::path::PathBuf;
use std::process::Command;

fn scratch(name: &str) -> PathBuf {
    let d = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn run(args: &[&str]) -> (i32, String, String) {
    let o = Command::new(env!("CARGO_BIN_EXE_character"))
        .args(args)
        .output()
        .unwrap();
    (
        o.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&o.stdout).into_owned(),
        String::from_utf8_lossy(&o.stderr).into_owned(),
    )
}

const FIX: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/");

#[test]
fn png_charx_and_back() {
    let d = scratch("cli-round-trip");
    let s = |p: &str| d.join(p).to_string_lossy().into_owned();
    let wren = format!("{FIX}wren.v2.json");
    assert_eq!(run(&["write-png", &wren, &s("wren.png")]).0, 0);
    let (c, out, _) = run(&["read", &s("wren.png")]);
    assert_eq!(c, 0);
    assert!(out.contains("\"source\": \"ccv3\""));
    let (c, out, _) = run(&["validate", &s("wren.png")]);
    assert_eq!((c, out.trim()), (0, "valid chara_card_v3"));
    std::fs::write(d.join("body.vrm"), [1u8, 2, 3]).unwrap();
    let pair = format!("assets/avatar/wren.vrm={}", s("body.vrm"));
    assert_eq!(
        run(&["charx-pack", &s("wren.png"), &s("wren.charx"), &pair]).0,
        0
    );
    let (c, out, _) = run(&["charx-unpack", &s("wren.charx"), &s("unpacked")]);
    assert_eq!(c, 0);
    assert_eq!(
        out.lines().collect::<Vec<_>>(),
        vec!["card.json", "assets/avatar/wren.vrm"]
    );
    assert_eq!(
        std::fs::read(d.join("unpacked/assets/avatar/wren.vrm")).unwrap(),
        vec![1, 2, 3]
    );
    assert_eq!(run(&["downgrade", &s("wren.charx"), &s("v2.json")]).0, 0);
    assert!(
        std::fs::read_to_string(d.join("v2.json"))
            .unwrap()
            .contains("\"chara_card_v2\"")
    );
}

#[test]
fn validate_fails_and_migrate_notes() {
    let (c, out, _) = run(&["validate", &format!("{FIX}odd.v1.json")]);
    assert_eq!(c, 1);
    assert!(out.contains("v1 card"));
    let d = scratch("cli-migrate");
    let out_path = d.join("m.json").to_string_lossy().into_owned();
    let (c, _, err) = run(&[
        "migrate",
        &format!("{FIX}pell.v3.json"),
        &out_path,
        "--create",
    ]);
    assert_eq!(c, 0);
    assert!(err.contains("profile: added with defaults"));
    assert_eq!(run(&["nonsense"]).0, 2);
    assert_eq!(run(&["read", "/no/such/file"]).0, 1);
}
