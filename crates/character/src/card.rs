//! Character Card V1, V2 (`chara_card_v2`) and V3 (`chara_card_v3`,
//! spec_version 3.0): detect, upgrade to V3, downgrade to V2, validate.
//! Field lists follow the published V2 and V3 specifications. Unknown keys
//! inside `data` are kept at the end, so a round trip loses only what the
//! target version has no place for.

use crate::json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Spec {
    V1,
    V2,
    V3,
    Unknown,
}

impl Spec {
    pub fn name(self) -> &'static str {
        match self {
            Spec::V1 => "v1",
            Spec::V2 => "chara_card_v2",
            Spec::V3 => "chara_card_v3",
            Spec::Unknown => "unknown",
        }
    }
}

/// String fields every V2 and V3 card carries, in spec order.
pub const STRING_FIELDS: [&str; 9] = [
    "name",
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
    "creator_notes",
    "system_prompt",
    "post_history_instructions",
];
const V1_FIELDS: [&str; 6] = [
    "name",
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
];
const V3_ONLY: [&str; 7] = [
    "group_only_greetings",
    "assets",
    "nickname",
    "creator_notes_multilingual",
    "source",
    "creation_date",
    "modification_date",
];
const CORE: [&str; 15] = [
    "name",
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
    "creator_notes",
    "system_prompt",
    "post_history_instructions",
    "alternate_greetings",
    "character_book",
    "tags",
    "creator",
    "character_version",
    "extensions",
];

pub fn detect(v: &Value) -> Spec {
    match v.get("spec").and_then(Value::as_str) {
        Some("chara_card_v3") => Spec::V3,
        Some("chara_card_v2") => Spec::V2,
        Some(_) => Spec::Unknown,
        None if v.get("data").is_some_and(Value::is_obj) => Spec::V2,
        None if v.get("name").is_some_and(|n| n.as_str().is_some()) => Spec::V1,
        None => Spec::Unknown,
    }
}

fn data_of(v: &Value) -> Result<Value, String> {
    match detect(v) {
        Spec::V1 => {
            let mut d = Value::obj();
            for k in V1_FIELDS {
                if let Some(x) = v.get(k) {
                    d.set(k, x.clone());
                }
            }
            Ok(d)
        }
        Spec::V2 | Spec::V3 => v
            .get("data")
            .filter(|d| d.is_obj())
            .cloned()
            .ok_or_else(|| "card: data is not an object".into()),
        Spec::Unknown => Err(format!(
            "card: unknown spec {}",
            v.get("spec")
                .map(Value::to_json)
                .unwrap_or_else(|| "(none)".into())
        )),
    }
}

fn str_list(v: Option<&Value>) -> Value {
    let items = v
        .and_then(Value::as_arr)
        .map(|a| a.iter().filter(|x| x.as_str().is_some()).cloned().collect())
        .unwrap_or_default();
    Value::Arr(items)
}

fn book(v: &Value, v3: bool) -> Value {
    let mut b = if v.is_obj() { v.clone() } else { Value::obj() };
    let entries = b
        .get("entries")
        .and_then(Value::as_arr)
        .cloned()
        .unwrap_or_default();
    let fixed: Vec<Value> = entries
        .into_iter()
        .filter(Value::is_obj)
        .map(|mut e| {
            if e.get("keys").and_then(Value::as_arr).is_none() {
                e.set("keys", Value::Arr(vec![]));
            }
            if e.get("content").and_then(Value::as_str).is_none() {
                e.set("content", Value::str(""));
            }
            if e.get("extensions").is_none_or(|x| !x.is_obj()) {
                e.set("extensions", Value::obj());
            }
            if e.get("enabled").and_then(Value::as_bool).is_none() {
                e.set("enabled", Value::Bool(true));
            }
            if e.get("insertion_order").and_then(Value::as_f64).is_none() {
                e.set("insertion_order", Value::Num(0.0));
            }
            if v3 {
                if e.get("use_regex").and_then(Value::as_bool).is_none() {
                    e.set("use_regex", Value::Bool(false));
                }
            } else {
                e.remove("use_regex");
            }
            e
        })
        .collect();
    b.set("entries", Value::Arr(fixed));
    if b.get("extensions").is_none_or(|x| !x.is_obj()) {
        b.set("extensions", Value::obj());
    }
    b
}

/// The card's data in spec order, with required fields present and typed.
fn normal_data(d: &Value, v3: bool) -> Value {
    let mut out = Value::obj();
    for k in STRING_FIELDS {
        out.set(
            k,
            Value::str(d.get(k).and_then(Value::as_str).unwrap_or("")),
        );
    }
    out.set(
        "alternate_greetings",
        str_list(d.get("alternate_greetings")),
    );
    if let Some(b) = d.get("character_book").filter(|b| b.is_obj()) {
        out.set("character_book", book(b, v3));
    }
    out.set("tags", str_list(d.get("tags")));
    out.set(
        "creator",
        Value::str(d.get("creator").and_then(Value::as_str).unwrap_or("")),
    );
    out.set(
        "character_version",
        Value::str(
            d.get("character_version")
                .and_then(Value::as_str)
                .unwrap_or(""),
        ),
    );
    out.set(
        "extensions",
        d.get("extensions")
            .filter(|x| x.is_obj())
            .cloned()
            .unwrap_or_else(Value::obj),
    );
    if v3 {
        out.set(
            "group_only_greetings",
            str_list(d.get("group_only_greetings")),
        );
        for k in &V3_ONLY[1..] {
            if let Some(x) = d.get(k)
                && !matches!(x, Value::Null)
            {
                out.set(k, x.clone());
            }
        }
    }
    if let Value::Obj(kv) = d {
        for (k, x) in kv {
            if !CORE.contains(&k.as_str()) && !V3_ONLY.contains(&k.as_str()) {
                out.set(k, x.clone());
            }
        }
    }
    out
}

/// Any card to V3. V3 input is normalized the same way.
pub fn upgrade(v: &Value) -> Result<Value, String> {
    let d = data_of(v)?;
    let mut out = Value::obj();
    out.set("spec", Value::str("chara_card_v3"));
    out.set("spec_version", Value::str("3.0"));
    out.set("data", normal_data(&d, true));
    Ok(out)
}

/// Any card to V2. V3 only fields (assets, nickname, group greetings,
/// multilingual notes, source, dates, use_regex) are dropped.
pub fn downgrade(v: &Value) -> Result<Value, String> {
    let d = data_of(v)?;
    let mut out = Value::obj();
    out.set("spec", Value::str("chara_card_v2"));
    out.set("spec_version", Value::str("2.0"));
    out.set("data", normal_data(&d, false));
    Ok(out)
}

fn check_str_list(issues: &mut Vec<String>, d: &Value, k: &str, required: bool) {
    match d.get(k) {
        None if required => issues.push(format!("data.{k}: missing")),
        None => {}
        Some(Value::Arr(a)) => {
            if let Some(i) = a.iter().position(|x| x.as_str().is_none()) {
                issues.push(format!("data.{k}[{i}]: not a string"));
            }
        }
        Some(x) => issues.push(format!(
            "data.{k}: {} where an array of strings belongs",
            x.type_name()
        )),
    }
}

/// Problems with a card as written, each prefixed by its path. Empty when valid.
pub fn validate(v: &Value) -> Vec<String> {
    let mut issues = Vec::new();
    let spec = detect(v);
    match spec {
        Spec::Unknown => {
            issues.push("spec: not chara_card_v2 or chara_card_v3".into());
            return issues;
        }
        Spec::V1 => {
            issues.push("spec: missing, read as a v1 card; upgrade it".into());
            return issues;
        }
        Spec::V2 => {
            if v.get("spec_version").and_then(Value::as_str) != Some("2.0") {
                issues.push("spec_version: should be \"2.0\"".into());
            }
        }
        Spec::V3 => {
            if !v
                .get("spec_version")
                .and_then(Value::as_str)
                .is_some_and(|s| s.starts_with("3."))
            {
                issues.push("spec_version: should be \"3.0\"".into());
            }
        }
    }
    let Some(d) = v.get("data").filter(|d| d.is_obj()) else {
        issues.push("data: missing or not an object".into());
        return issues;
    };
    for k in STRING_FIELDS
        .iter()
        .chain(["creator", "character_version"].iter())
    {
        match d.get(k) {
            None => issues.push(format!("data.{k}: missing")),
            Some(Value::Str(_)) => {}
            Some(x) => issues.push(format!(
                "data.{k}: {} where a string belongs",
                x.type_name()
            )),
        }
    }
    if d.get("name")
        .and_then(Value::as_str)
        .is_some_and(|s| s.trim().is_empty())
    {
        issues.push("data.name: empty".into());
    }
    check_str_list(&mut issues, d, "alternate_greetings", true);
    check_str_list(&mut issues, d, "tags", true);
    if spec == Spec::V3 {
        check_str_list(&mut issues, d, "group_only_greetings", true);
        if let Some(a) = d.get("assets") {
            match a.as_arr() {
                None => issues.push("data.assets: not an array".into()),
                Some(list) => {
                    for (i, x) in list.iter().enumerate() {
                        for k in ["type", "uri", "name", "ext"] {
                            if x.get(k).and_then(Value::as_str).is_none() {
                                issues
                                    .push(format!("data.assets[{i}].{k}: missing or not a string"));
                            }
                        }
                    }
                }
            }
        }
        for k in ["creation_date", "modification_date"] {
            if d.get(k).is_some_and(|x| x.as_f64().is_none()) {
                issues.push(format!("data.{k}: not a number of seconds"));
            }
        }
    }
    match d.get("extensions") {
        Some(x) if x.is_obj() => {
            if let Some(p) = x.get(crate::profile::KEY) {
                for m in crate::profile::check(p) {
                    issues.push(format!("data.extensions.{}.{m}", crate::profile::KEY));
                }
            }
        }
        Some(_) => issues.push("data.extensions: not an object".into()),
        None => issues.push("data.extensions: missing".into()),
    }
    if let Some(b) = d.get("character_book") {
        if !b.is_obj() {
            issues.push("data.character_book: not an object".into());
        } else if let Some(es) = b.get("entries").and_then(Value::as_arr) {
            for (i, e) in es.iter().enumerate() {
                let p = format!("data.character_book.entries[{i}]");
                if !e
                    .get("keys")
                    .and_then(Value::as_arr)
                    .is_some_and(|a| a.iter().all(|k| k.as_str().is_some()))
                {
                    issues.push(format!("{p}.keys: not an array of strings"));
                }
                if e.get("content").and_then(Value::as_str).is_none() {
                    issues.push(format!("{p}.content: missing or not a string"));
                }
                if e.get("enabled").and_then(Value::as_bool).is_none() {
                    issues.push(format!("{p}.enabled: missing or not a boolean"));
                }
                if e.get("insertion_order").and_then(Value::as_f64).is_none() {
                    issues.push(format!("{p}.insertion_order: missing or not a number"));
                }
                if spec == Spec::V3 && e.get("use_regex").and_then(Value::as_bool).is_none() {
                    issues.push(format!("{p}.use_regex: missing or not a boolean"));
                }
            }
        } else {
            issues.push("data.character_book.entries: missing or not an array".into());
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    #[test]
    fn v1_to_v3_to_v2() {
        let v1 = parse(r#"{"name":"Wren","description":"a moth who keeps a lamp","first_mes":"the lamp is on."}"#).unwrap();
        assert_eq!(detect(&v1), Spec::V1);
        let v3 = upgrade(&v1).unwrap();
        assert!(validate(&v3).is_empty(), "{:?}", validate(&v3));
        assert_eq!(
            v3.get("data").unwrap().get("first_mes").unwrap().as_str(),
            Some("the lamp is on.")
        );
        let v2 = downgrade(&v3).unwrap();
        assert!(validate(&v2).is_empty(), "{:?}", validate(&v2));
        assert!(
            v2.get("data")
                .unwrap()
                .get("group_only_greetings")
                .is_none()
        );
    }

    #[test]
    fn keeps_unknown_data_keys_and_book() {
        let v2 = parse(r#"{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"A","zz_custom":7,"character_book":{"entries":[{"keys":["lamp"],"content":"it is brass"}]}}}"#).unwrap();
        let v3 = upgrade(&v2).unwrap();
        let d = v3.get("data").unwrap();
        assert_eq!(d.get("zz_custom").unwrap().as_f64(), Some(7.0));
        let e = &d
            .get("character_book")
            .unwrap()
            .get("entries")
            .unwrap()
            .as_arr()
            .unwrap()[0];
        assert_eq!(e.get("use_regex").unwrap().as_bool(), Some(false));
        assert!(validate(&v3).is_empty(), "{:?}", validate(&v3));
        let back = downgrade(&v3).unwrap();
        let e2 = &back
            .get("data")
            .unwrap()
            .get("character_book")
            .unwrap()
            .get("entries")
            .unwrap()
            .as_arr()
            .unwrap()[0];
        assert!(e2.get("use_regex").is_none());
    }

    #[test]
    fn validate_names_problems() {
        let bad = parse(r#"{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"","tags":[1],"extensions":[]}}"#).unwrap();
        let issues = validate(&bad);
        assert!(issues.contains(&"data.name: empty".to_string()));
        assert!(issues.contains(&"data.tags[0]: not a string".to_string()));
        assert!(issues.contains(&"data.extensions: not an object".to_string()));
        assert!(issues.contains(&"data.group_only_greetings: missing".to_string()));
        assert_eq!(validate(&parse(r#"{"spec":"x"}"#).unwrap()).len(), 1);
        assert!(upgrade(&parse(r#"{"spec":"x"}"#).unwrap()).is_err());
    }
}
