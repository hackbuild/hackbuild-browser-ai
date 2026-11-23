//! character: read, convert and pack character cards from the command line.
//!
//!   character read <card>                     the card and where it came from, as JSON
//!   character upgrade <card> [out]            to V3 JSON
//!   character downgrade <card> [out]          to V2 JSON
//!   character validate <card>                 problems, one per line; exit 1 when any
//!   character migrate <card> [out] [--create] bring the profile extension to the current version
//!   character write-png <card> <out.png> [--image base.png] [--mode both|v3|v2]
//!   character charx-pack <card> <out.charx> [path=file ...] [--no-refs]
//!   character charx-unpack <in.charx> <dir>
//!
//! <card> is a PNG, a CHARX archive or JSON; the format is detected from the bytes.

use hackbuild_character::{json::Value, ops, read, zip};
use std::path::Path;
use std::process::ExitCode;

fn load(p: &str) -> Result<Vec<u8>, String> {
    std::fs::read(p).map_err(|e| format!("{p}: {e}"))
}

fn emit(out: Option<&String>, bytes: &[u8]) -> Result<(), String> {
    match out {
        Some(p) => std::fs::write(p, bytes).map_err(|e| format!("{p}: {e}")),
        None => {
            println!("{}", String::from_utf8_lossy(bytes));
            Ok(())
        }
    }
}

fn pretty(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let v =
        hackbuild_character::json::parse(std::str::from_utf8(&bytes).map_err(|_| "not utf-8")?)?;
    Ok(v.to_pretty().into_bytes())
}

fn run(args: &[String]) -> Result<u8, String> {
    let flag = |name: &str| args.iter().any(|a| a == name);
    let opt = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let mut pos: Vec<&String> = Vec::new();
    let mut skip = false;
    for a in args.iter().skip(1) {
        if skip {
            skip = false;
        } else if a == "--image" || a == "--mode" {
            skip = true;
        } else if !a.starts_with("--") {
            pos.push(a);
        }
    }
    let cmd = args.first().map(String::as_str).unwrap_or("help");
    let need = |n: usize| -> Result<(), String> {
        if pos.len() < n {
            Err(format!("{cmd}: needs {n} arguments"))
        } else {
            Ok(())
        }
    };
    match cmd {
        "read" => {
            need(1)?;
            emit(None, &pretty(ops::read(&load(pos[0])?)?)?)?;
        }
        "upgrade" | "downgrade" => {
            need(1)?;
            let b = load(pos[0])?;
            let out = if cmd == "upgrade" {
                ops::upgrade(&b)?
            } else {
                ops::downgrade(&b)?
            };
            emit(pos.get(1).copied(), &pretty(out)?)?;
        }
        "validate" => {
            need(1)?;
            let r = read(&load(pos[0])?)?;
            let issues = hackbuild_character::card::validate(&r.card);
            for i in &issues {
                println!("{i}");
            }
            if !issues.is_empty() {
                return Ok(1);
            }
            println!(
                "valid {}",
                hackbuild_character::card::detect(&r.card).name()
            );
        }
        "migrate" => {
            need(1)?;
            let out = ops::migrate(&load(pos[0])?, flag("--create"))?;
            let v = hackbuild_character::json::parse(
                std::str::from_utf8(&out).map_err(|_| "not utf-8")?,
            )?;
            if let Some(Value::Arr(notes)) = v.get("notes") {
                for n in notes {
                    eprintln!("{}", n.as_str().unwrap_or(""));
                }
            }
            let card = v.get("card").ok_or("migrate: no card")?;
            emit(pos.get(1).copied(), card.to_pretty().as_bytes())?;
        }
        "write-png" => {
            need(2)?;
            let base = match opt("--image") {
                Some(p) => load(&p)?,
                None => vec![],
            };
            let mode = match opt("--mode").as_deref() {
                Some("v3") => 1,
                Some("v2") => 2,
                Some("both") | None => 0,
                Some(m) => return Err(format!("write-png: unknown mode {m}")),
            };
            std::fs::write(pos[1], ops::write_png(&base, &load(pos[0])?, mode)?)
                .map_err(|e| e.to_string())?;
        }
        "charx-pack" => {
            need(2)?;
            let mut pack = Vec::new();
            for spec in &pos[2..] {
                let (name, file) = spec
                    .split_once('=')
                    .ok_or_else(|| format!("charx-pack: {spec} is not path=file"))?;
                let data = load(file)?;
                pack.extend_from_slice(&(name.len() as u32).to_le_bytes());
                pack.extend_from_slice(name.as_bytes());
                pack.extend_from_slice(&(data.len() as u32).to_le_bytes());
                pack.extend_from_slice(&data);
            }
            std::fs::write(
                pos[1],
                ops::write_charx(&load(pos[0])?, &pack, !flag("--no-refs"))?,
            )
            .map_err(|e| e.to_string())?;
        }
        "charx-unpack" => {
            need(2)?;
            let b = load(pos[0])?;
            let dir = Path::new(pos[1].as_str());
            for e in zip::entries(&b)? {
                if e.name.ends_with('/') {
                    continue;
                }
                if e.name.starts_with('/')
                    || e.name.contains('\\')
                    || e.name.split('/').any(|s| s == "..")
                {
                    return Err(format!("charx-unpack: unsafe path {}", e.name));
                }
                let to = dir.join(&e.name);
                if let Some(parent) = to.parent() {
                    std::fs::create_dir_all(parent).map_err(|x| x.to_string())?;
                }
                std::fs::write(&to, zip::read_entry(&b, &e)?).map_err(|x| x.to_string())?;
                println!("{}", e.name);
            }
        }
        _ => {
            eprintln!(
                "usage: character read|upgrade|downgrade|validate|migrate|write-png|charx-pack|charx-unpack ..."
            );
            return Ok(2);
        }
    }
    Ok(0)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(c) => ExitCode::from(c),
        Err(e) => {
            eprintln!("character: {e}");
            ExitCode::from(1)
        }
    }
}
