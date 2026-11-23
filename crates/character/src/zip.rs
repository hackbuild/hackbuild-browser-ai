//! ZIP read (stored and deflate entries, through the central directory)
//! and write (stored entries only, fixed timestamps so the same input
//! gives the same bytes). Zip64 and encryption are refused.

use crate::bytes::crc32;
use crate::inflate::inflate_raw;

pub struct Entry {
    pub name: String,
    pub method: u16,
    pub crc: u32,
    pub size: usize,
    pub csize: usize,
    pub offset: usize,
}

fn u16_at(b: &[u8], i: usize) -> Result<u16, String> {
    b.get(i..i + 2)
        .map(|s| u16::from_le_bytes([s[0], s[1]]))
        .ok_or_else(|| "zip: truncated".into())
}
fn u32_at(b: &[u8], i: usize) -> Result<u32, String> {
    b.get(i..i + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .ok_or_else(|| "zip: truncated".into())
}

pub fn is_zip(b: &[u8]) -> bool {
    b.starts_with(b"PK\x03\x04") || b.starts_with(b"PK\x05\x06")
}

pub fn entries(b: &[u8]) -> Result<Vec<Entry>, String> {
    let lo = b.len().saturating_sub(22 + 65535);
    let eocd = (lo..b.len().saturating_sub(21))
        .rev()
        .find(|&i| b[i..].starts_with(b"PK\x05\x06"))
        .ok_or("zip: no end of central directory")?;
    let n = u16_at(b, eocd + 10)? as usize;
    let mut p = u32_at(b, eocd + 16)? as usize;
    if p == 0xffff_ffff || n == 0xffff {
        return Err("zip: zip64 archives are not read".into());
    }
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        if u32_at(b, p)? != 0x0201_4b50 {
            return Err("zip: bad central directory".into());
        }
        let flags = u16_at(b, p + 8)?;
        if flags & 1 != 0 {
            return Err("zip: encrypted entries are not read".into());
        }
        let nl = u16_at(b, p + 28)? as usize;
        let el = u16_at(b, p + 30)? as usize;
        let cl = u16_at(b, p + 32)? as usize;
        let name_b = b.get(p + 46..p + 46 + nl).ok_or("zip: truncated")?;
        let name = if flags & 0x800 != 0 {
            String::from_utf8(name_b.to_vec()).map_err(|_| "zip: name is not utf-8")?
        } else {
            String::from_utf8(name_b.to_vec())
                .unwrap_or_else(|_| name_b.iter().map(|&c| c as char).collect())
        };
        out.push(Entry {
            name,
            method: u16_at(b, p + 10)?,
            crc: u32_at(b, p + 16)?,
            csize: u32_at(b, p + 20)? as usize,
            size: u32_at(b, p + 24)? as usize,
            offset: u32_at(b, p + 42)? as usize,
        });
        p += 46 + nl + el + cl;
    }
    Ok(out)
}

/// The bytes of one entry, inflated and CRC checked.
pub fn read_entry(b: &[u8], e: &Entry) -> Result<Vec<u8>, String> {
    if u32_at(b, e.offset)? != 0x0403_4b50 {
        return Err("zip: bad local header".into());
    }
    let nl = u16_at(b, e.offset + 26)? as usize;
    let el = u16_at(b, e.offset + 28)? as usize;
    let st = e.offset + 30 + nl + el;
    let data = b
        .get(st..st + e.csize)
        .ok_or("zip: entry runs past the end")?;
    let out = match e.method {
        0 => data.to_vec(),
        8 => inflate_raw(data, e.size.max(1))?,
        m => return Err(format!("zip: compression method {m} is not read")),
    };
    if out.len() != e.size || crc32(&out) != e.crc {
        return Err(format!("zip: crc or size mismatch in {}", e.name));
    }
    Ok(out)
}

/// A stored (uncompressed) archive of the files in the order given.
pub fn write_stored(files: &[(String, Vec<u8>)]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for (name, data) in files {
        if out.len() > u32::MAX as usize || data.len() > u32::MAX as usize {
            return Err("zip: archive over 4 GB".into());
        }
        let crc = crc32(data);
        let off = out.len() as u32;
        let nb = name.as_bytes();
        let head = |sig: u32, central_dir: bool| {
            let mut h = Vec::new();
            h.extend_from_slice(&sig.to_le_bytes());
            if central_dir {
                h.extend_from_slice(&20u16.to_le_bytes());
            }
            h.extend_from_slice(&20u16.to_le_bytes()); // version needed
            h.extend_from_slice(&0x0800u16.to_le_bytes()); // utf-8 names
            h.extend_from_slice(&0u16.to_le_bytes()); // stored
            h.extend_from_slice(&0u16.to_le_bytes()); // time 00:00
            h.extend_from_slice(&0x0021u16.to_le_bytes()); // date 1980-01-01
            h.extend_from_slice(&crc.to_le_bytes());
            h.extend_from_slice(&(data.len() as u32).to_le_bytes());
            h.extend_from_slice(&(data.len() as u32).to_le_bytes());
            h.extend_from_slice(&(nb.len() as u16).to_le_bytes());
            h.extend_from_slice(&0u16.to_le_bytes());
            h
        };
        out.extend_from_slice(&head(0x0403_4b50, false));
        out.extend_from_slice(nb);
        out.extend_from_slice(data);
        central.extend_from_slice(&head(0x0201_4b50, true));
        central.extend_from_slice(&[0; 10]); // comment length, disk, internal and external attributes
        central.extend_from_slice(&off.to_le_bytes());
        central.extend_from_slice(nb);
    }
    let cd = out.len() as u32;
    out.extend_from_slice(&central);
    out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    out.extend_from_slice(&[0, 0, 0, 0]);
    out.extend_from_slice(&(files.len() as u16).to_le_bytes());
    out.extend_from_slice(&(files.len() as u16).to_le_bytes());
    out.extend_from_slice(&(central.len() as u32).to_le_bytes());
    out.extend_from_slice(&cd.to_le_bytes());
    out.extend_from_slice(&[0, 0]);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_round_trip() {
        let files = vec![
            ("card.json".to_string(), b"{}".to_vec()),
            ("assets/icon/main.png".to_string(), vec![1, 2, 3]),
            ("empty".to_string(), vec![]),
        ];
        let z = write_stored(&files).unwrap();
        let es = entries(&z).unwrap();
        assert_eq!(es.len(), 3);
        for (e, (n, d)) in es.iter().zip(&files) {
            assert_eq!(&e.name, n);
            assert_eq!(&read_entry(&z, e).unwrap(), d);
        }
        assert_eq!(write_stored(&files).unwrap(), z);
    }

    #[test]
    fn corrupt() {
        let files = vec![("a".to_string(), b"abc".to_vec())];
        let mut z = write_stored(&files).unwrap();
        z[31] ^= 1;
        let es = entries(&z).unwrap();
        assert!(read_entry(&z, &es[0]).is_err());
        assert!(entries(b"PK\x03\x04").is_err());
    }
}
