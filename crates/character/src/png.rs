//! PNG chunks: list them, read the text chunks that carry a card (tEXt,
//! zTXt and iTXt with keyword `chara` for V2 or `ccv3` for V3) and write
//! the card back in tEXt chunks just before IEND. Pixel data is never
//! decoded; every other chunk is copied as it was.

use crate::bytes::{b64_encode, crc32};
use crate::inflate::{MAX_OUT, inflate_zlib, zlib_stored};

pub const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

pub struct Chunk<'a> {
    pub kind: [u8; 4],
    pub data: &'a [u8],
}

pub fn is_png(b: &[u8]) -> bool {
    b.starts_with(&SIGNATURE)
}

/// Every chunk in order, with CRCs checked; stops after IEND.
pub fn chunks(b: &[u8]) -> Result<Vec<Chunk<'_>>, String> {
    if !is_png(b) {
        return Err("png: no png signature".into());
    }
    let mut out = Vec::new();
    let mut i = 8;
    loop {
        let h = b.get(i..i + 8).ok_or("png: truncated before IEND")?;
        let len = u32::from_be_bytes([h[0], h[1], h[2], h[3]]) as usize;
        let kind = [h[4], h[5], h[6], h[7]];
        let data = b
            .get(i + 8..i + 8 + len)
            .ok_or("png: chunk runs past the end")?;
        let c = b
            .get(i + 8 + len..i + 12 + len)
            .ok_or("png: chunk runs past the end")?;
        let want = u32::from_be_bytes([c[0], c[1], c[2], c[3]]);
        let mut crc_in = Vec::with_capacity(len + 4);
        crc_in.extend_from_slice(&kind);
        crc_in.extend_from_slice(data);
        if crc32(&crc_in) != want {
            return Err(format!(
                "png: crc mismatch in {}",
                String::from_utf8_lossy(&kind)
            ));
        }
        out.push(Chunk { kind, data });
        i += 12 + len;
        if &kind == b"IEND" {
            return Ok(out);
        }
    }
}

/// A text chunk's keyword and text, or None for other chunks.
pub fn text_of(c: &Chunk) -> Result<Option<(String, String)>, String> {
    let latin1 = |b: &[u8]| b.iter().map(|&x| x as char).collect::<String>();
    let split = |d: &[u8]| -> Option<usize> { d.iter().position(|&x| x == 0) };
    match &c.kind {
        b"tEXt" => {
            let Some(z) = split(c.data) else {
                return Ok(None);
            };
            Ok(Some((latin1(&c.data[..z]), latin1(&c.data[z + 1..]))))
        }
        b"zTXt" => {
            let Some(z) = split(c.data) else {
                return Ok(None);
            };
            let body = c.data.get(z + 2..).ok_or("png: short zTXt")?;
            Ok(Some((
                latin1(&c.data[..z]),
                latin1(&inflate_zlib(body, MAX_OUT)?),
            )))
        }
        b"iTXt" => {
            let Some(z) = split(c.data) else {
                return Ok(None);
            };
            let kw = latin1(&c.data[..z]);
            let flag = *c.data.get(z + 1).ok_or("png: short iTXt")?;
            let rest = c.data.get(z + 3..).ok_or("png: short iTXt")?;
            let l = split(rest).ok_or("png: bad iTXt")?;
            let rest = &rest[l + 1..];
            let t = split(rest).ok_or("png: bad iTXt")?;
            let body = &rest[t + 1..];
            let text = if flag == 1 {
                inflate_zlib(body, MAX_OUT)?
            } else {
                body.to_vec()
            };
            Ok(Some((
                kw,
                String::from_utf8(text).map_err(|_| "png: iTXt is not utf-8")?,
            )))
        }
        _ => Ok(None),
    }
}

/// Card text found in a PNG: keyword ("ccv3" or "chara") and the decoded JSON text.
/// ccv3 wins when both are present, as card readers agree.
pub fn read_card_text(b: &[u8]) -> Result<(String, String), String> {
    let mut found: Vec<(String, String)> = Vec::new();
    for c in chunks(b)? {
        if let Some((k, t)) = text_of(&c)?
            && (k == "ccv3" || k == "chara")
        {
            found.push((k, t));
        }
    }
    let pick = found
        .iter()
        .find(|(k, _)| k == "ccv3")
        .or_else(|| found.iter().find(|(k, _)| k == "chara"));
    let (k, t) = pick.ok_or("png: no chara or ccv3 text chunk")?;
    Ok((k.clone(), decode_payload(t)?))
}

/// Base64 of UTF-8 JSON is the format; some writers put the JSON in as is.
pub fn decode_payload(t: &str) -> Result<String, String> {
    let s = t.trim();
    if s.starts_with('{') {
        // tEXt is Latin-1 on paper; JSON written raw by a UTF-8 writer comes back byte for byte.
        let raw: Vec<u8> = s.chars().map(|c| c as u32 as u8).collect();
        return String::from_utf8(raw).or_else(|_| Ok(s.to_string()));
    }
    let bytes = crate::bytes::b64_decode(s)?;
    String::from_utf8(bytes).map_err(|_| "png: card text is not utf-8".into())
}

fn push_chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let st = out.len();
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let crc = crc32(&out[st..]);
    out.extend_from_slice(&crc.to_be_bytes());
}

fn is_card_chunk(c: &Chunk) -> bool {
    if !matches!(&c.kind, b"tEXt" | b"zTXt" | b"iTXt") {
        return false;
    }
    let kw = c.data.split(|&x| x == 0).next().unwrap_or(&[]);
    kw == b"chara" || kw == b"ccv3"
}

/// Copy a PNG with old card chunks removed and the given (keyword, json)
/// pairs written as base64 tEXt chunks before IEND.
pub fn write_texts(png: &[u8], texts: &[(&str, &str)]) -> Result<Vec<u8>, String> {
    let cs = chunks(png)?;
    let mut out = SIGNATURE.to_vec();
    for c in &cs {
        if is_card_chunk(c) {
            continue;
        }
        if &c.kind == b"IEND" {
            for (k, json) in texts {
                let mut d = k.as_bytes().to_vec();
                d.push(0);
                d.extend_from_slice(b64_encode(json.as_bytes()).as_bytes());
                push_chunk(&mut out, b"tEXt", &d);
            }
        }
        push_chunk(&mut out, &c.kind, c.data);
    }
    Ok(out)
}

/// A plain RGB PNG of one colour, for a card with no picture.
pub fn blank(w: u32, h: u32, rgb: [u8; 3]) -> Vec<u8> {
    let (w, h) = (w.clamp(1, 4096), h.clamp(1, 4096));
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&w.to_be_bytes());
    ihdr.extend_from_slice(&h.to_be_bytes());
    ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
    let mut raw = Vec::with_capacity(((w * 3 + 1) * h) as usize);
    let mut row = vec![0u8];
    for _ in 0..w {
        row.extend_from_slice(&rgb);
    }
    for _ in 0..h {
        raw.extend_from_slice(&row);
    }
    let mut out = SIGNATURE.to_vec();
    push_chunk(&mut out, b"IHDR", &ihdr);
    push_chunk(&mut out, b"IDAT", &zlib_stored(&raw));
    push_chunk(&mut out, b"IEND", &[]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_prefers_ccv3() {
        let png = blank(2, 2, [10, 20, 30]);
        let a = write_texts(
            &png,
            &[
                ("chara", "{\"v\":2}"),
                ("ccv3", "{\"v\":3,\"t\":\"\u{e9}\"}"),
            ],
        )
        .unwrap();
        assert_eq!(
            read_card_text(&a).unwrap(),
            ("ccv3".to_string(), "{\"v\":3,\"t\":\"\u{e9}\"}".to_string())
        );
        let b = write_texts(&a, &[("chara", "{\"v\":4}")]).unwrap();
        assert_eq!(read_card_text(&b).unwrap().1, "{\"v\":4}");
        assert_eq!(chunks(&b).unwrap().len(), 4);
    }

    #[test]
    fn ztxt_and_itxt() {
        let png = blank(1, 1, [0, 0, 0]);
        let mut z = b"chara\0\0".to_vec();
        z.extend_from_slice(&zlib_stored(b64_encode(b"{\"z\":1}").as_bytes()));
        let mut out = SIGNATURE.to_vec();
        for c in chunks(&png).unwrap() {
            if &c.kind == b"IEND" {
                push_chunk(&mut out, b"zTXt", &z);
            }
            push_chunk(&mut out, &c.kind, c.data);
        }
        assert_eq!(read_card_text(&out).unwrap().1, "{\"z\":1}");
        let mut it = b"ccv3\0\0\0en\0\0".to_vec();
        it.extend_from_slice(b"{\"i\":\"\xc3\xa9\"}");
        let mut out2 = SIGNATURE.to_vec();
        for c in chunks(&out).unwrap() {
            if &c.kind == b"IEND" {
                push_chunk(&mut out2, b"iTXt", &it);
            }
            push_chunk(&mut out2, &c.kind, c.data);
        }
        assert_eq!(
            read_card_text(&out2).unwrap(),
            ("ccv3".to_string(), "{\"i\":\"\u{e9}\"}".to_string())
        );
    }

    #[test]
    fn bad_crc_and_missing_card() {
        let mut png = blank(1, 1, [1, 2, 3]);
        assert!(read_card_text(&png).is_err());
        png[20] ^= 1;
        assert!(chunks(&png).is_err());
        assert!(chunks(b"nope").is_err());
    }
}
