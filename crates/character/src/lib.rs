//! hackbuild-character: Character Card V2 and V3 read and write, as JSON,
//! inside PNG text chunks and as CHARX archives, plus a versioned profile
//! extension for avatar, voice and action vocabulary. No dependencies.
//! Builds natively and for wasm32-unknown-unknown; the two give the same
//! bytes for the same input (tests/parity.rs).
//!
//! The wasm surface is plain `extern "C"` over linear memory: the caller
//! allocates with `cc_alloc`, writes input bytes, calls one function, and
//! reads the result from `cc_out_ptr` and `cc_out_len`. A call returns 0
//! on success; on failure it returns 1 and the out buffer holds the
//! message as UTF-8.

pub mod bytes;
pub mod card;
pub mod inflate;
pub mod json;
pub mod png;
pub mod profile;
pub mod zip;

use json::Value;
use std::cell::RefCell;

/// Where a card came from.
pub struct Read {
    pub format: &'static str,
    pub source: String,
    pub card: Value,
    /// CHARX entries other than card.json: name and size in bytes.
    pub assets: Vec<(String, usize)>,
}

impl Read {
    pub fn to_value(&self) -> Value {
        let mut o = Value::obj();
        o.set("format", Value::str(self.format));
        o.set("source", Value::str(&self.source));
        o.set("spec", Value::str(card::detect(&self.card).name()));
        o.set("card", self.card.clone());
        let assets = self
            .assets
            .iter()
            .map(|(n, s)| {
                let mut a = Value::obj();
                a.set("name", Value::str(n));
                a.set("size", Value::Num(*s as f64));
                a
            })
            .collect();
        o.set("assets", Value::Arr(assets));
        o
    }
}

fn parse_utf8(b: &[u8]) -> Result<Value, String> {
    json::parse(std::str::from_utf8(b).map_err(|_| "card: text is not utf-8")?)
}

/// Read a card from PNG, CHARX or JSON bytes, as stored (not upgraded).
pub fn read(b: &[u8]) -> Result<Read, String> {
    if png::is_png(b) {
        let (kw, text) = png::read_card_text(b)?;
        return Ok(Read {
            format: "png",
            source: kw,
            card: json::parse(&text)?,
            assets: vec![],
        });
    }
    if zip::is_zip(b) {
        let es = zip::entries(b)?;
        let e = es
            .iter()
            .find(|e| e.name == "card.json")
            .ok_or("charx: no card.json")?;
        let card = parse_utf8(&zip::read_entry(b, e)?)?;
        let assets = es
            .iter()
            .filter(|e| e.name != "card.json" && !e.name.ends_with('/'))
            .map(|e| (e.name.clone(), e.size))
            .collect();
        return Ok(Read {
            format: "charx",
            source: "card.json".into(),
            card,
            assets,
        });
    }
    Ok(Read {
        format: "json",
        source: "json".into(),
        card: parse_utf8(b)?,
        assets: vec![],
    })
}

/// One file from a CHARX archive.
pub fn charx_entry(b: &[u8], name: &str) -> Result<Vec<u8>, String> {
    let es = zip::entries(b)?;
    let e = es
        .iter()
        .find(|e| e.name == name)
        .ok_or_else(|| format!("charx: no entry {name}"))?;
    zip::read_entry(b, e)
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PngMode {
    /// `chara` (V2) and `ccv3` (V3), what most readers expect.
    Both,
    V3,
    V2,
}

/// Write a card into a PNG (a plain 64 by 64 one when none is given).
pub fn write_png(png_in: Option<&[u8]>, c: &Value, mode: PngMode) -> Result<Vec<u8>, String> {
    let blank;
    let base = match png_in {
        Some(b) => b,
        None => {
            blank = png::blank(64, 64, [200, 200, 196]);
            &blank
        }
    };
    let v3 = card::upgrade(c)?.to_json();
    let v2 = card::downgrade(c)?.to_json();
    let texts: Vec<(&str, &str)> = match mode {
        PngMode::Both => vec![("chara", &v2), ("ccv3", &v3)],
        PngMode::V3 => vec![("ccv3", &v3)],
        PngMode::V2 => vec![("chara", &v2)],
    };
    png::write_texts(base, &texts)
}

fn safe_path(p: &str) -> bool {
    !p.is_empty()
        && !p.starts_with('/')
        && !p.contains('\\')
        && !p.split('/').any(|s| s == ".." || s == "." || s.is_empty())
        && p != "card.json"
}

/// The `data.assets` record for a CHARX path: type from `assets/<type>/...`
/// (the layout the V3 spec recommends), else `x_file`.
pub fn asset_record(path: &str) -> Value {
    let parts: Vec<&str> = path.split('/').collect();
    let kind = if parts.len() > 2 && parts[0] == "assets" {
        parts[1]
    } else {
        "x_file"
    };
    let file = parts.last().copied().unwrap_or("");
    let (stem, ext) = match file.rfind('.') {
        Some(i) if i > 0 => (&file[..i], file[i + 1..].to_lowercase()),
        _ => (file, String::new()),
    };
    let mut a = Value::obj();
    a.set("type", Value::str(kind));
    a.set("uri", Value::Str(format!("embeded://{path}")));
    a.set(
        "name",
        Value::str(if kind == "icon" { "main" } else { stem }),
    );
    a.set("ext", Value::Str(ext));
    a
}

/// A CHARX archive: card.json (as V3) first, then the files in order.
/// With `refs`, each file the card does not yet list in `data.assets`
/// gets a record ("embeded://" is the spelling the V3 spec uses).
pub fn write_charx(c: &Value, files: &[(String, Vec<u8>)], refs: bool) -> Result<Vec<u8>, String> {
    let mut v3 = card::upgrade(c)?;
    for (p, _) in files {
        if !safe_path(p) {
            return Err(format!("charx: unsafe or reserved path {p}"));
        }
    }
    if refs {
        let data = v3.get_mut("data").ok_or("card: no data")?;
        let mut list = data
            .get("assets")
            .and_then(Value::as_arr)
            .cloned()
            .unwrap_or_default();
        for (p, _) in files {
            let uri = format!("embeded://{p}");
            if !list
                .iter()
                .any(|a| a.get("uri").and_then(Value::as_str) == Some(uri.as_str()))
            {
                list.push(asset_record(p));
            }
        }
        if !list.is_empty() {
            data.set("assets", Value::Arr(list));
        }
    }
    let mut all = vec![("card.json".to_string(), v3.to_pretty().into_bytes())];
    all.extend(files.iter().cloned());
    zip::write_stored(&all)
}

/// Migrate the profile extension inside a card. With `create`, a card
/// without one gets the default profile. Returns the card and notes.
pub fn migrate_card(c: &Value, create: bool) -> Result<(Value, Vec<String>), String> {
    let mut out = c.clone();
    let spec = card::detect(c);
    if !matches!(spec, card::Spec::V2 | card::Spec::V3) {
        return Err("card: migrate needs a v2 or v3 card; upgrade it first".into());
    }
    let data = out
        .get_mut("data")
        .filter(|d| d.is_obj())
        .ok_or("card: data is not an object")?;
    if data.get("extensions").is_none_or(|x| !x.is_obj()) {
        data.set("extensions", Value::obj());
    }
    let ext = data.get_mut("extensions").ok_or("card: no extensions")?;
    let notes = match ext.get(profile::KEY) {
        Some(p) => {
            let (m, n) = profile::migrate(p);
            ext.set(profile::KEY, m);
            n
        }
        None if create => {
            ext.set(profile::KEY, profile::default_profile());
            vec!["profile: added with defaults".into()]
        }
        None => vec![],
    };
    Ok((out, notes))
}

fn with_notes(key: &str, v: Value, notes: Vec<String>) -> Value {
    let mut o = Value::obj();
    o.set(key, v);
    o.set(
        "notes",
        Value::Arr(notes.into_iter().map(Value::Str).collect()),
    );
    o
}

/// Pack files for `cc_write_charx`: per file a u32 LE name length, the
/// UTF-8 name, a u32 LE data length and the data.
pub fn unpack_files(b: &[u8]) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut out = Vec::new();
    let mut i = 0;
    let u32_at = |i: &mut usize| -> Result<usize, String> {
        let s = b.get(*i..*i + 4).ok_or("pack: truncated")?;
        *i += 4;
        Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]) as usize)
    };
    while i < b.len() {
        let n = u32_at(&mut i)?;
        let name = String::from_utf8(b.get(i..i + n).ok_or("pack: truncated")?.to_vec())
            .map_err(|_| "pack: name is not utf-8")?;
        i += n;
        let m = u32_at(&mut i)?;
        out.push((name, b.get(i..i + m).ok_or("pack: truncated")?.to_vec()));
        i += m;
    }
    Ok(out)
}

/// The operations the wasm surface and the CLI share; each returns bytes.
pub mod ops {
    use super::*;

    pub fn read(b: &[u8]) -> Result<Vec<u8>, String> {
        Ok(super::read(b)?.to_value().to_json().into_bytes())
    }
    fn card_in(b: &[u8]) -> Result<Value, String> {
        Ok(super::read(b)?.card)
    }
    pub fn upgrade(b: &[u8]) -> Result<Vec<u8>, String> {
        Ok(card::upgrade(&card_in(b)?)?.to_json().into_bytes())
    }
    pub fn downgrade(b: &[u8]) -> Result<Vec<u8>, String> {
        Ok(card::downgrade(&card_in(b)?)?.to_json().into_bytes())
    }
    pub fn validate(b: &[u8]) -> Result<Vec<u8>, String> {
        let issues = card::validate(&card_in(b)?);
        Ok(Value::Arr(issues.into_iter().map(Value::Str).collect())
            .to_json()
            .into_bytes())
    }
    pub fn migrate(b: &[u8], create: bool) -> Result<Vec<u8>, String> {
        let (c, n) = migrate_card(&card_in(b)?, create)?;
        Ok(with_notes("card", c, n).to_json().into_bytes())
    }
    pub fn migrate_profile(b: &[u8]) -> Result<Vec<u8>, String> {
        let (p, n) = profile::migrate(&parse_utf8(b)?);
        Ok(with_notes("profile", p, n).to_json().into_bytes())
    }
    pub fn write_png(png_in: &[u8], c: &[u8], mode: u32) -> Result<Vec<u8>, String> {
        let m = match mode {
            1 => PngMode::V3,
            2 => PngMode::V2,
            _ => PngMode::Both,
        };
        super::write_png(
            if png_in.is_empty() {
                None
            } else {
                Some(png_in)
            },
            &card_in(c)?,
            m,
        )
    }
    pub fn write_charx(c: &[u8], pack: &[u8], refs: bool) -> Result<Vec<u8>, String> {
        super::write_charx(&card_in(c)?, &unpack_files(pack)?, refs)
    }
}

thread_local! {
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn finish(r: Result<Vec<u8>, String>) -> u32 {
    let (code, bytes) = match r {
        Ok(b) => (0, b),
        Err(e) => (1, e.into_bytes()),
    };
    OUT.with(|o| *o.borrow_mut() = bytes);
    code
}

/// # Safety
/// `p` must point to `n` readable bytes (or `n` must be 0).
unsafe fn slice<'a>(p: *const u8, n: usize) -> &'a [u8] {
    if n == 0 || p.is_null() {
        &[]
    } else {
        // SAFETY: the caller wrote n bytes at p through cc_alloc.
        unsafe { std::slice::from_raw_parts(p, n) }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn cc_alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `cc_alloc(len)` and not be freed twice.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_free(ptr: *mut u8, len: usize) {
    // SAFETY: ptr came from cc_alloc with this capacity.
    drop(unsafe { Vec::from_raw_parts(ptr, 0, len.max(1)) });
}

#[unsafe(no_mangle)]
pub extern "C" fn cc_out_ptr() -> *const u8 {
    OUT.with(|o| o.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn cc_out_len() -> usize {
    OUT.with(|o| o.borrow().len())
}

#[unsafe(no_mangle)]
pub extern "C" fn cc_profile_version() -> f64 {
    profile::VERSION
}

/// # Safety
/// Input pointers must hold the stated number of bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_read(p: *const u8, n: usize) -> u32 {
    finish(ops::read(unsafe { slice(p, n) }))
}

/// # Safety
/// Input pointers must hold the stated number of bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_entry(p: *const u8, n: usize, np: *const u8, nn: usize) -> u32 {
    let name = String::from_utf8_lossy(unsafe { slice(np, nn) }).into_owned();
    finish(charx_entry(unsafe { slice(p, n) }, &name))
}

/// # Safety
/// Input pointers must hold the stated number of bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_upgrade(p: *const u8, n: usize) -> u32 {
    finish(ops::upgrade(unsafe { slice(p, n) }))
}

/// # Safety
/// Input pointers must hold the stated number of bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_downgrade(p: *const u8, n: usize) -> u32 {
    finish(ops::downgrade(unsafe { slice(p, n) }))
}

/// # Safety
/// Input pointers must hold the stated number of bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_validate(p: *const u8, n: usize) -> u32 {
    finish(ops::validate(unsafe { slice(p, n) }))
}

/// # Safety
/// Input pointers must hold the stated number of bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_migrate(p: *const u8, n: usize, create: u32) -> u32 {
    finish(ops::migrate(unsafe { slice(p, n) }, create != 0))
}

/// # Safety
/// Input pointers must hold the stated number of bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_migrate_profile(p: *const u8, n: usize) -> u32 {
    finish(ops::migrate_profile(unsafe { slice(p, n) }))
}

/// # Safety
/// Input pointers must hold the stated number of bytes. `pn` 0 means no base PNG.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_write_png(
    pp: *const u8,
    pn: usize,
    cp: *const u8,
    cn: usize,
    mode: u32,
) -> u32 {
    finish(ops::write_png(
        unsafe { slice(pp, pn) },
        unsafe { slice(cp, cn) },
        mode,
    ))
}

/// # Safety
/// Input pointers must hold the stated number of bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn cc_write_charx(
    cp: *const u8,
    cn: usize,
    fp: *const u8,
    fn_: usize,
    refs: u32,
) -> u32 {
    finish(ops::write_charx(
        unsafe { slice(cp, cn) },
        unsafe { slice(fp, fn_) },
        refs != 0,
    ))
}

#[unsafe(no_mangle)]
pub extern "C" fn cc_blank_png(w: u32, h: u32, rgb: u32) -> u32 {
    finish(Ok(png::blank(
        w,
        h,
        [(rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8],
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Value {
        json::parse(r#"{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Wren","description":"a moth who keeps a brass lamp","first_mes":"the lamp is lit.","tags":["moth"],"extensions":{"hackbuild":{"version":1,"voice":{"engine":"kokoro","voiceId":"af_heart"}}}}}"#).unwrap()
    }

    #[test]
    fn png_round_trip_both_chunks() {
        let png = write_png(None, &sample(), PngMode::Both).unwrap();
        let r = read(&png).unwrap();
        assert_eq!(r.format, "png");
        assert_eq!(r.source, "ccv3");
        assert_eq!(card::detect(&r.card), card::Spec::V3);
        let v2 = write_png(Some(&png), &sample(), PngMode::V2).unwrap();
        assert_eq!(read(&v2).unwrap().source, "chara");
    }

    #[test]
    fn charx_round_trip_with_refs() {
        let files = vec![
            ("assets/avatar/body.vrm".to_string(), vec![7u8; 40]),
            (
                "assets/icon/main.png".to_string(),
                png::blank(2, 2, [0, 0, 0]),
            ),
        ];
        let z = write_charx(&sample(), &files, true).unwrap();
        let r = read(&z).unwrap();
        assert_eq!(r.format, "charx");
        assert_eq!(r.assets.len(), 2);
        let a = r
            .card
            .get("data")
            .unwrap()
            .get("assets")
            .unwrap()
            .as_arr()
            .unwrap();
        assert_eq!(
            a[0].get("uri").unwrap().as_str(),
            Some("embeded://assets/avatar/body.vrm")
        );
        assert_eq!(a[1].get("name").unwrap().as_str(), Some("main"));
        assert_eq!(
            charx_entry(&z, "assets/avatar/body.vrm").unwrap(),
            vec![7u8; 40]
        );
        assert!(write_charx(&sample(), &[("../x".into(), vec![])], true).is_err());
        assert!(write_charx(&sample(), &[("card.json".into(), vec![])], true).is_err());
    }

    #[test]
    fn migrate_card_creates_and_fixes() {
        let (c, notes) = migrate_card(&sample(), false).unwrap();
        let p = c
            .get("data")
            .unwrap()
            .get("extensions")
            .unwrap()
            .get("hackbuild")
            .unwrap();
        assert_eq!(
            p.get("voice").unwrap().get("voiceId").unwrap().as_str(),
            Some("af_heart")
        );
        assert!(notes.is_empty(), "{notes:?}");
        let bare =
            json::parse(r#"{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"x"}}"#)
                .unwrap();
        let (c2, n2) = migrate_card(&bare, true).unwrap();
        assert!(
            c2.get("data")
                .unwrap()
                .get("extensions")
                .unwrap()
                .get("hackbuild")
                .is_some()
        );
        assert_eq!(n2, vec!["profile: added with defaults".to_string()]);
    }

    #[test]
    fn pack_format() {
        let mut b = Vec::new();
        for (n, d) in [("a/b.txt", &b"hi"[..]), ("c", &b""[..])] {
            b.extend_from_slice(&(n.len() as u32).to_le_bytes());
            b.extend_from_slice(n.as_bytes());
            b.extend_from_slice(&(d.len() as u32).to_le_bytes());
            b.extend_from_slice(d);
        }
        let f = unpack_files(&b).unwrap();
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].1, b"hi");
        assert!(unpack_files(&b[..5]).is_err());
    }
}
