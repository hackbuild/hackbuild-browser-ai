//! A JSON value that keeps object keys in the order they were read, with a
//! parser and a deterministic writer. Numbers are f64; a whole number under
//! 2^53 is written without a fraction, anything else through the shortest
//! round trip form of core's float formatting, which is the same code on
//! every target.

use std::fmt::Write;

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

const MAX_DEPTH: usize = 200;

impl Value {
    pub fn obj() -> Value {
        Value::Obj(Vec::new())
    }
    pub fn str(s: &str) -> Value {
        Value::Str(s.to_string())
    }
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Obj(kv) => kv.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn get_mut(&mut self, key: &str) -> Option<&mut Value> {
        match self {
            Value::Obj(kv) => kv.iter_mut().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    /// Set a key, keeping its position when it exists and appending otherwise.
    pub fn set(&mut self, key: &str, v: Value) {
        if let Value::Obj(kv) = self {
            if let Some(slot) = kv.iter_mut().find(|(k, _)| k == key) {
                slot.1 = v;
            } else {
                kv.push((key.to_string(), v));
            }
        }
    }
    pub fn remove(&mut self, key: &str) -> Option<Value> {
        if let Value::Obj(kv) = self
            && let Some(i) = kv.iter().position(|(k, _)| k == key)
        {
            return Some(kv.remove(i).1);
        }
        None
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Num(n) => Some(*n),
            _ => None,
        }
    }
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }
    pub fn as_arr(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Arr(a) => Some(a),
            _ => None,
        }
    }
    pub fn is_obj(&self) -> bool {
        matches!(self, Value::Obj(_))
    }
    pub fn type_name(&self) -> &'static str {
        match self {
            Value::Null => "null",
            Value::Bool(_) => "boolean",
            Value::Num(_) => "number",
            Value::Str(_) => "string",
            Value::Arr(_) => "array",
            Value::Obj(_) => "object",
        }
    }

    /// Compact text with no spaces.
    pub fn to_json(&self) -> String {
        let mut s = String::new();
        write_value(&mut s, self, None, 0);
        s
    }
    /// Text indented by two spaces, for people.
    pub fn to_pretty(&self) -> String {
        let mut s = String::new();
        write_value(&mut s, self, Some(2), 0);
        s
    }
}

fn write_num(s: &mut String, n: f64) {
    if !n.is_finite() {
        s.push_str("null");
    } else if n.fract() == 0.0 && n.abs() < 9_007_199_254_740_992.0 {
        let _ = write!(s, "{}", n as i64);
    } else {
        let _ = write!(s, "{n}");
    }
}

pub fn write_str(s: &mut String, t: &str) {
    s.push('"');
    for c in t.chars() {
        match c {
            '"' => s.push_str("\\\""),
            '\\' => s.push_str("\\\\"),
            '\n' => s.push_str("\\n"),
            '\r' => s.push_str("\\r"),
            '\t' => s.push_str("\\t"),
            '\u{8}' => s.push_str("\\b"),
            '\u{c}' => s.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(s, "\\u{:04x}", c as u32);
            }
            c => s.push(c),
        }
    }
    s.push('"');
}

fn newline(s: &mut String, indent: Option<usize>, depth: usize) {
    if let Some(n) = indent {
        s.push('\n');
        for _ in 0..n * depth {
            s.push(' ');
        }
    }
}

fn write_value(s: &mut String, v: &Value, indent: Option<usize>, depth: usize) {
    match v {
        Value::Null => s.push_str("null"),
        Value::Bool(b) => s.push_str(if *b { "true" } else { "false" }),
        Value::Num(n) => write_num(s, *n),
        Value::Str(t) => write_str(s, t),
        Value::Arr(a) => {
            s.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    s.push(',');
                }
                newline(s, indent, depth + 1);
                write_value(s, x, indent, depth + 1);
            }
            if !a.is_empty() {
                newline(s, indent, depth);
            }
            s.push(']');
        }
        Value::Obj(kv) => {
            s.push('{');
            for (i, (k, x)) in kv.iter().enumerate() {
                if i > 0 {
                    s.push(',');
                }
                newline(s, indent, depth + 1);
                write_str(s, k);
                s.push(':');
                if indent.is_some() {
                    s.push(' ');
                }
                write_value(s, x, indent, depth + 1);
            }
            if !kv.is_empty() {
                newline(s, indent, depth);
            }
            s.push('}');
        }
    }
}

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}

pub fn parse(text: &str) -> Result<Value, String> {
    let t = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut p = Parser {
        b: t.as_bytes(),
        i: 0,
    };
    p.ws();
    let v = p.value(0)?;
    p.ws();
    if p.i != p.b.len() {
        return Err(format!("json: text after the value at byte {}", p.i));
    }
    Ok(v)
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\n' | b'\r') {
            self.i += 1;
        }
    }
    fn err(&self, what: &str) -> String {
        format!("json: {what} at byte {}", self.i)
    }
    fn lit(&mut self, word: &str, v: Value) -> Result<Value, String> {
        if self.b[self.i..].starts_with(word.as_bytes()) {
            self.i += word.len();
            Ok(v)
        } else {
            Err(self.err("unknown word"))
        }
    }
    fn value(&mut self, depth: usize) -> Result<Value, String> {
        if depth > MAX_DEPTH {
            return Err(self.err("nesting too deep"));
        }
        match self.b.get(self.i) {
            None => Err(self.err("unexpected end")),
            Some(b'n') => self.lit("null", Value::Null),
            Some(b't') => self.lit("true", Value::Bool(true)),
            Some(b'f') => self.lit("false", Value::Bool(false)),
            Some(b'"') => Ok(Value::Str(self.string()?)),
            Some(b'[') => {
                self.i += 1;
                let mut a = Vec::new();
                self.ws();
                if self.b.get(self.i) == Some(&b']') {
                    self.i += 1;
                    return Ok(Value::Arr(a));
                }
                loop {
                    self.ws();
                    a.push(self.value(depth + 1)?);
                    self.ws();
                    match self.b.get(self.i) {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            return Ok(Value::Arr(a));
                        }
                        _ => return Err(self.err("expected , or ]")),
                    }
                }
            }
            Some(b'{') => {
                self.i += 1;
                let mut o = Value::obj();
                self.ws();
                if self.b.get(self.i) == Some(&b'}') {
                    self.i += 1;
                    return Ok(o);
                }
                loop {
                    self.ws();
                    if self.b.get(self.i) != Some(&b'"') {
                        return Err(self.err("expected a key"));
                    }
                    let k = self.string()?;
                    self.ws();
                    if self.b.get(self.i) != Some(&b':') {
                        return Err(self.err("expected :"));
                    }
                    self.i += 1;
                    self.ws();
                    let v = self.value(depth + 1)?;
                    o.set(&k, v);
                    self.ws();
                    match self.b.get(self.i) {
                        Some(b',') => self.i += 1,
                        Some(b'}') => {
                            self.i += 1;
                            return Ok(o);
                        }
                        _ => return Err(self.err("expected , or }")),
                    }
                }
            }
            Some(_) => self.number(),
        }
    }
    fn number(&mut self) -> Result<Value, String> {
        let st = self.i;
        while self.i < self.b.len()
            && matches!(
                self.b[self.i],
                b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9'
            )
        {
            self.i += 1;
        }
        let t = std::str::from_utf8(&self.b[st..self.i]).map_err(|_| self.err("bad number"))?;
        if t.is_empty() || t.starts_with('+') || t.starts_with('.') {
            return Err(self.err("bad number"));
        }
        t.parse::<f64>()
            .map(Value::Num)
            .map_err(|_| self.err("bad number"))
    }
    fn hex4(&mut self) -> Result<u32, String> {
        let h = self
            .b
            .get(self.i..self.i + 4)
            .ok_or_else(|| self.err("short escape"))?;
        let t = std::str::from_utf8(h).map_err(|_| self.err("bad escape"))?;
        let v = u32::from_str_radix(t, 16).map_err(|_| self.err("bad escape"))?;
        self.i += 4;
        Ok(v)
    }
    fn string(&mut self) -> Result<String, String> {
        self.i += 1;
        let mut out = String::new();
        loop {
            let st = self.i;
            while self.i < self.b.len() && self.b[self.i] != b'"' && self.b[self.i] != b'\\' {
                self.i += 1;
            }
            out.push_str(
                std::str::from_utf8(&self.b[st..self.i]).map_err(|_| self.err("bad utf-8"))?,
            );
            match self.b.get(self.i) {
                None => return Err(self.err("unclosed string")),
                Some(b'"') => {
                    self.i += 1;
                    return Ok(out);
                }
                _ => {
                    self.i += 1;
                    let c = *self
                        .b
                        .get(self.i)
                        .ok_or_else(|| self.err("unclosed string"))?;
                    self.i += 1;
                    match c {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let hi = self.hex4()?;
                            let cp = if (0xd800..0xdc00).contains(&hi)
                                && self.b.get(self.i..self.i + 2) == Some(b"\\u")
                            {
                                let save = self.i;
                                self.i += 2;
                                let lo = self.hex4()?;
                                if (0xdc00..0xe000).contains(&lo) {
                                    0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00)
                                } else {
                                    self.i = save;
                                    0xfffd
                                }
                            } else {
                                hi
                            };
                            out.push(char::from_u32(cp).unwrap_or('\u{fffd}'));
                        }
                        _ => return Err(self.err("bad escape")),
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_keeps_order_and_escapes() {
        let t = r#"{"b":1,"a":[true,null,-2.5,1e3,"x\n\"y\" \u00e9 \ud840\udc00"],"c":{}}"#;
        let v = parse(t).unwrap();
        assert_eq!(
            v.to_json(),
            "{\"b\":1,\"a\":[true,null,-2.5,1000,\"x\\n\\\"y\\\" \u{e9} \u{20000}\"],\"c\":{}}"
        );
        assert_eq!(parse(&v.to_pretty()).unwrap(), v);
    }

    #[test]
    fn rejects_bad_text() {
        for t in ["{", "[1,]", "{\"a\" 1}", "01x", "\"abc", "[1] 2", "+1"] {
            assert!(parse(t).is_err(), "{t}");
        }
        let deep = "[".repeat(500) + &"]".repeat(500);
        assert!(parse(&deep).is_err());
    }

    #[test]
    fn numbers() {
        assert_eq!(parse("0.1").unwrap().to_json(), "0.1");
        assert_eq!(parse("-0").unwrap().to_json(), "0");
        assert_eq!(
            parse("12345678901234567890").unwrap().to_json(),
            "12345678901234567000"
        );
    }
}
