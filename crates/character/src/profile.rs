//! The profile extension: what a card needs to drive a body and a voice,
//! stored at `data.extensions.hackbuild` so other card readers keep it
//! untouched. Versioned. `migrate` reads any earlier or hand written shape
//! by picking each field from a default shape: unknown keys are dropped,
//! missing keys take the default, accepted older spellings are carried
//! over, a value of the wrong type takes the default and a number out of
//! range is clamped. Every change is reported as a note. A key keeps its
//! meaning across versions; a changed meaning gets a new key.
//!
//! `voice.cloneRef` names a reference clip the caller supplies (a CHARX
//! asset path such as `embeded://assets/voice/ref.wav`, or a URL). The
//! library never bundles one.

use crate::json::Value;

pub const KEY: &str = "hackbuild";
pub const VERSION: f64 = 1.0;

/// Lock record algorithms this version reads.
pub const LOCK_ALGOS: [&str; 1] = ["pbkdf2-sha256"];

pub const AVATAR_KINDS: [&str; 5] = ["vrm", "glb", "fbx", "mmd", "live2d"];

enum S {
    Str(&'static str),
    Num(f64, f64, f64),
    Bool(bool),
    Enum(&'static str, &'static [&'static str]),
    StrList,
    Map(Box<S>),
    Obj(Vec<(&'static str, S)>),
    /// A key that is left out when absent; when present it must be an object.
    Opt(Box<S>),
}

fn shape() -> S {
    use S::*;
    Obj(vec![
        ("version", Num(VERSION, 0.0, 1e9)),
        (
            "avatar",
            Obj(vec![
                ("uri", Str("")),
                ("asset", Str("")),
                ("kind", Enum("vrm", &AVATAR_KINDS)),
                ("expressions", Map(Box::new(Str("")))),
                ("wardrobe", Map(Box::new(Bool(true)))),
            ]),
        ),
        (
            "voice",
            Obj(vec![
                ("engine", Str("system")),
                ("voiceId", Str("")),
                ("rate", Num(1.0, 0.25, 4.0)),
                ("pitch", Num(1.0, 0.0, 2.0)),
                ("cloneRef", Str("")),
            ]),
        ),
        (
            "actions",
            Obj(vec![
                ("moods", StrList),
                ("gestures", StrList),
                ("postures", StrList),
                ("aliases", Map(Box::new(Str("")))),
            ]),
        ),
        (
            "behavior",
            Obj(vec![
                ("gaze", Bool(true)),
                ("blink", Bool(true)),
                ("breath", Bool(true)),
                ("idle", Bool(true)),
                ("ambientGestures", Bool(true)),
            ]),
        ),
        ("memory", Obj(vec![("enabled", Bool(false))])),
        (
            "lock",
            Opt(Box::new(Obj(vec![
                ("algo", Enum("pbkdf2-sha256", &LOCK_ALGOS)),
                ("iterations", Num(210_000.0, 1.0, 1e7)),
                ("salt", Str("")),
                ("hash", Str("")),
            ]))),
        ),
    ])
}

/// Older or hand written spellings carried over to the current key: (object path, old key, key).
pub const RENAMES: [(&str, &str, &str); 7] = [
    ("avatar", "url", "uri"),
    ("avatar", "type", "kind"),
    ("voice", "id", "voiceId"),
    ("voice", "voice_id", "voiceId"),
    ("voice", "clone_ref", "cloneRef"),
    ("behavior", "ambient_gestures", "ambientGestures"),
    ("", "motion", "actions"),
];

fn default_of(s: &S) -> Value {
    match s {
        S::Str(d) => Value::str(d),
        S::Num(d, _, _) => Value::Num(*d),
        S::Bool(b) => Value::Bool(*b),
        S::Enum(d, _) => Value::str(d),
        S::StrList => Value::Arr(vec![]),
        S::Map(_) => Value::obj(),
        S::Obj(fs) => Value::Obj(
            fs.iter()
                .filter(|(_, f)| !matches!(f, S::Opt(_)))
                .map(|(k, f)| (k.to_string(), default_of(f)))
                .collect(),
        ),
        S::Opt(inner) => default_of(inner),
    }
}

/// The profile with every field at its default.
pub fn default_profile() -> Value {
    default_of(&shape())
}

fn pick(s: &S, raw: Option<&Value>, path: &str, notes: &mut Vec<String>) -> Value {
    let Some(raw) = raw else { return default_of(s) };
    let wrong = |notes: &mut Vec<String>| {
        notes.push(format!(
            "{path}: {} where {} belongs, default used",
            raw.type_name(),
            kind_name(s)
        ))
    };
    match s {
        S::Str(_) => match raw {
            Value::Str(t) => Value::str(t),
            _ => {
                wrong(notes);
                default_of(s)
            }
        },
        S::Num(_, lo, hi) => match raw {
            Value::Num(n) => {
                let c = n.clamp(*lo, *hi);
                if c != *n {
                    notes.push(format!(
                        "{path}: {} clamped to {}",
                        Value::Num(*n).to_json(),
                        Value::Num(c).to_json()
                    ));
                }
                Value::Num(c)
            }
            _ => {
                wrong(notes);
                default_of(s)
            }
        },
        S::Bool(_) => match raw {
            Value::Bool(b) => Value::Bool(*b),
            _ => {
                wrong(notes);
                default_of(s)
            }
        },
        S::Enum(_, opts) => match raw.as_str().map(|t| t.trim().to_lowercase()) {
            Some(t) if opts.contains(&t.as_str()) => Value::Str(t),
            Some(t) => {
                notes.push(format!(
                    "{path}: \"{t}\" is not one of {}, default used",
                    opts.join(", ")
                ));
                default_of(s)
            }
            None => {
                wrong(notes);
                default_of(s)
            }
        },
        S::StrList => match raw {
            Value::Arr(a) => {
                let keep: Vec<Value> = a
                    .iter()
                    .filter(|x| x.as_str().is_some_and(|t| !t.trim().is_empty()))
                    .cloned()
                    .collect();
                if keep.len() != a.len() {
                    notes.push(format!(
                        "{path}: {} items that are not names dropped",
                        a.len() - keep.len()
                    ));
                }
                Value::Arr(keep)
            }
            _ => {
                wrong(notes);
                default_of(s)
            }
        },
        S::Map(inner) => match raw {
            Value::Obj(kv) => {
                let mut out = Value::obj();
                for (k, x) in kv {
                    let ok = matches!(
                        (inner.as_ref(), x),
                        (S::Str(_), Value::Str(_)) | (S::Bool(_), Value::Bool(_))
                    );
                    if ok {
                        out.set(k, x.clone());
                    } else {
                        notes.push(format!(
                            "{path}.{k}: {} where {} belongs, dropped",
                            x.type_name(),
                            kind_name(inner)
                        ));
                    }
                }
                out
            }
            _ => {
                wrong(notes);
                default_of(s)
            }
        },
        S::Opt(inner) => pick(inner, Some(raw), path, notes),
        S::Obj(fs) => {
            let Value::Obj(kv) = raw else {
                wrong(notes);
                return default_of(s);
            };
            let mut out = Value::obj();
            for (k, f) in fs {
                let mut src = raw.get(k);
                if src.is_none()
                    && let Some((_, old, _)) = RENAMES.iter().find(|(p, old, new)| {
                        *p == path_tail(path) && *new == *k && raw.get(old).is_some()
                    })
                {
                    notes.push(format!("{}: carried over from {old}", join(path, k)));
                    src = raw.get(old);
                }
                if let S::Opt(inner) = f {
                    match src {
                        None => {}
                        Some(v) if v.is_obj() => {
                            out.set(k, pick(inner, src, &join(path, k), notes))
                        }
                        Some(v) => notes.push(format!(
                            "{}: {} where an object belongs, dropped",
                            join(path, k),
                            v.type_name()
                        )),
                    }
                    continue;
                }
                out.set(k, pick(f, src, &join(path, k), notes));
            }
            for (k, _) in kv {
                let known = fs.iter().any(|(n, _)| n == k);
                let renamed = RENAMES
                    .iter()
                    .any(|(p, old, _)| *p == path_tail(path) && old == k);
                if !known && !renamed {
                    notes.push(format!("{}: unknown key dropped", join(path, k)));
                }
            }
            out
        }
    }
}

fn path_tail(path: &str) -> &str {
    path.rsplit('.').next().unwrap_or("")
}

fn join(path: &str, k: &str) -> String {
    if path.is_empty() {
        k.to_string()
    } else {
        format!("{path}.{k}")
    }
}

fn kind_name(s: &S) -> &'static str {
    match s {
        S::Str(_) | S::Enum(..) => "a string",
        S::Num(..) => "a number",
        S::Bool(_) => "a boolean",
        S::StrList => "an array of strings",
        S::Map(_) | S::Obj(_) | S::Opt(_) => "an object",
    }
}

/// Bring a profile of any version to the current shape. Returns the profile and notes.
pub fn migrate(raw: &Value) -> (Value, Vec<String>) {
    let mut notes = Vec::new();
    match raw.get("version").and_then(Value::as_f64) {
        None if raw.is_obj() => notes.push(format!(
            "version: missing, read as version {}",
            Value::Num(VERSION).to_json()
        )),
        Some(v) if v > VERSION => notes.push(format!(
            "version: {} is newer than {}, keys this version does not know are dropped",
            Value::Num(v).to_json(),
            Value::Num(VERSION).to_json()
        )),
        _ => {}
    }
    let mut out = pick(&shape(), Some(raw), "", &mut notes);
    notes.retain(|n| !n.starts_with("version:") || n.contains("missing") || n.contains("newer"));
    out.set("version", Value::Num(VERSION));
    (out, notes)
}

/// Problems with a profile as written, without changing it.
pub fn check(raw: &Value) -> Vec<String> {
    let mut notes = Vec::new();
    pick(&shape(), Some(raw), "", &mut notes);
    if raw.get("version").and_then(Value::as_f64).is_none() && raw.is_obj() {
        notes.insert(0, "version: missing".into());
    }
    notes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    #[test]
    fn defaults_and_clean_input() {
        let d = default_profile();
        let (m, notes) = migrate(&d);
        assert_eq!(m, d);
        assert!(notes.is_empty(), "{notes:?}");
        assert!(check(&d).is_empty());
    }

    #[test]
    fn picks_by_shape_and_type() {
        let raw = parse(
            r#"{"avatar":{"url":"embeded://assets/avatar/body.vrm","kind":"VRM","extra":1},
                "voice":{"voice_id":"af_heart","rate":9,"pitch":"high"},
                "actions":{"moods":["happy",3,"sad"],"aliases":{"grin":"happy","n":2}},
                "behavior":{"blink":false},"zz":true}"#,
        )
        .unwrap();
        let (m, notes) = migrate(&raw);
        assert_eq!(m.get("version").unwrap().as_f64(), Some(1.0));
        let av = m.get("avatar").unwrap();
        assert_eq!(
            av.get("uri").unwrap().as_str(),
            Some("embeded://assets/avatar/body.vrm")
        );
        assert_eq!(av.get("kind").unwrap().as_str(), Some("vrm"));
        let v = m.get("voice").unwrap();
        assert_eq!(v.get("voiceId").unwrap().as_str(), Some("af_heart"));
        assert_eq!(v.get("rate").unwrap().as_f64(), Some(4.0));
        assert_eq!(v.get("pitch").unwrap().as_f64(), Some(1.0));
        assert_eq!(
            m.get("actions")
                .unwrap()
                .get("moods")
                .unwrap()
                .as_arr()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            m.get("actions").unwrap().get("aliases").unwrap().to_json(),
            "{\"grin\":\"happy\"}"
        );
        assert_eq!(
            m.get("behavior").unwrap().get("blink").unwrap().as_bool(),
            Some(false)
        );
        assert_eq!(
            m.get("behavior").unwrap().get("gaze").unwrap().as_bool(),
            Some(true)
        );
        for want in [
            "version: missing",
            "avatar.uri: carried over from url",
            "avatar.extra: unknown key dropped",
            "voice.rate: 9 clamped to 4",
            "zz: unknown key dropped",
        ] {
            assert!(
                notes.iter().any(|n| n.starts_with(want)),
                "{want} in {notes:?}"
            );
        }
        let (again, n2) = migrate(&m);
        assert_eq!(again, m);
        assert!(n2.is_empty());
    }

    #[test]
    fn optional_lock() {
        let d = default_profile();
        assert!(d.get("lock").is_none());
        let raw = parse(
            r#"{"version":1,"lock":{"algo":"PBKDF2-SHA256","salt":"c2FsdA==","hash":"aGFzaA==","zz":1}}"#,
        )
        .unwrap();
        let (m, notes) = migrate(&raw);
        let l = m.get("lock").unwrap();
        assert_eq!(l.get("algo").unwrap().as_str(), Some("pbkdf2-sha256"));
        assert_eq!(l.get("iterations").unwrap().as_f64(), Some(210_000.0));
        assert_eq!(l.get("salt").unwrap().as_str(), Some("c2FsdA=="));
        assert!(
            notes
                .iter()
                .any(|n| n.starts_with("lock.zz: unknown key dropped"))
        );
        let (again, n2) = migrate(&m);
        assert_eq!(again, m);
        assert!(n2.is_empty(), "{n2:?}");
        let (gone, n3) = migrate(&parse(r#"{"version":1,"lock":"x"}"#).unwrap());
        assert!(gone.get("lock").is_none());
        assert!(
            n3.iter()
                .any(|n| n.starts_with("lock: string where an object belongs"))
        );
    }

    #[test]
    fn newer_version_and_non_object() {
        let (m, notes) =
            migrate(&parse(r#"{"version":5,"voice":{"engine":"kokoro"},"future":{}}"#).unwrap());
        assert_eq!(
            m.get("voice").unwrap().get("engine").unwrap().as_str(),
            Some("kokoro")
        );
        assert!(notes[0].contains("newer"));
        let (d, _) = migrate(&Value::Num(3.0));
        assert_eq!(d, default_profile());
    }
}
