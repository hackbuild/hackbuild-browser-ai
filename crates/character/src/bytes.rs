//! Base64, CRC-32 and Adler-32.

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn b64_encode(b: &[u8]) -> String {
    let mut s = String::with_capacity(b.len().div_ceil(3) * 4);
    for c in b.chunks(3) {
        let n = (c[0] as u32) << 16
            | (*c.get(1).unwrap_or(&0) as u32) << 8
            | *c.get(2).unwrap_or(&0) as u32;
        s.push(B64[(n >> 18) as usize & 63] as char);
        s.push(B64[(n >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 {
            B64[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        s.push(if c.len() > 2 {
            B64[n as usize & 63] as char
        } else {
            '='
        });
    }
    s
}

/// Decodes standard or URL safe base64; whitespace is skipped, padding optional.
pub fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut acc = 0u32;
    let mut n = 0;
    for &c in s.as_bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            b' ' | b'\n' | b'\r' | b'\t' => continue,
            _ => return Err("base64: bad character".into()),
        };
        acc = acc << 6 | v as u32;
        n += 1;
        if n == 4 {
            out.extend_from_slice(&[(acc >> 16) as u8, (acc >> 8) as u8, acc as u8]);
            acc = 0;
            n = 0;
        }
    }
    match n {
        0 => {}
        2 => out.push((acc >> 4) as u8),
        3 => out.extend_from_slice(&[(acc >> 10) as u8, (acc >> 2) as u8]),
        _ => return Err("base64: truncated".into()),
    }
    Ok(out)
}

fn crc_table() -> [u32; 256] {
    let mut t = [0u32; 256];
    for (i, slot) in t.iter_mut().enumerate() {
        let mut c = i as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 {
                0xedb8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
        }
        *slot = c;
    }
    t
}

/// CRC-32 (IEEE, as PNG and ZIP use it), continued from `crc`; start at 0.
pub fn crc32_update(crc: u32, b: &[u8]) -> u32 {
    let t = crc_table();
    let mut c = !crc;
    for &x in b {
        c = t[((c ^ x as u32) & 0xff) as usize] ^ (c >> 8);
    }
    !c
}

pub fn crc32(b: &[u8]) -> u32 {
    crc32_update(0, b)
}

pub fn adler32(b: &[u8]) -> u32 {
    let (mut a, mut s) = (1u32, 0u32);
    for c in b.chunks(5552) {
        for &x in c {
            a += x as u32;
            s += a;
        }
        a %= 65521;
        s %= 65521;
    }
    s << 16 | a
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn vectors() {
        assert_eq!(b64_encode(b"foobar"), "Zm9vYmFy");
        assert_eq!(b64_encode(b"fo"), "Zm8=");
        assert_eq!(b64_decode("Zm9vYg").unwrap(), b"foob");
        assert_eq!(b64_decode("Zm9v\nYmE=").unwrap(), b"fooba");
        assert!(b64_decode("Z").is_err());
        assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
        assert_eq!(adler32(b"Wikipedia"), 0x11e6_0398);
    }
}
