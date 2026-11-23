//! A DEFLATE decoder (RFC 1951) with the zlib wrapper (RFC 1950), written
//! from the RFCs: stored, fixed and dynamic Huffman blocks. Output is
//! capped so a hostile archive cannot ask for unbounded memory.

/// Largest output one call produces, in bytes.
pub const MAX_OUT: usize = 512 << 20;

struct Bits<'a> {
    b: &'a [u8],
    pos: usize,
    bit: u32,
    nbits: u32,
}

impl Bits<'_> {
    fn need(&mut self, n: u32) -> Result<(), String> {
        while self.nbits < n {
            let byte = *self
                .b
                .get(self.pos)
                .ok_or("inflate: unexpected end of data")?;
            self.pos += 1;
            self.bit |= (byte as u32) << self.nbits;
            self.nbits += 8;
        }
        Ok(())
    }
    fn take(&mut self, n: u32) -> Result<u32, String> {
        if n == 0 {
            return Ok(0);
        }
        self.need(n)?;
        let v = self.bit & ((1u32 << n) - 1);
        self.bit >>= n;
        self.nbits -= n;
        Ok(v)
    }
    fn align(&mut self) {
        self.bit = 0;
        self.nbits = 0;
    }
}

/// Canonical Huffman table: counts per length and symbols in code order.
struct Huff {
    count: [u16; 16],
    sym: Vec<u16>,
}

impl Huff {
    fn new(lengths: &[u8]) -> Result<Huff, String> {
        let mut count = [0u16; 16];
        for &l in lengths {
            count[l as usize] += 1;
        }
        count[0] = 0;
        let mut left: i32 = 1;
        for &c in &count[1..] {
            left = (left << 1) - c as i32;
            if left < 0 {
                return Err("inflate: over subscribed code".into());
            }
        }
        let mut offs = [0u16; 16];
        for l in 1..15 {
            offs[l + 1] = offs[l] + count[l];
        }
        let mut sym = vec![0u16; lengths.len()];
        for (s, &l) in lengths.iter().enumerate() {
            if l != 0 {
                sym[offs[l as usize] as usize] = s as u16;
                offs[l as usize] += 1;
            }
        }
        Ok(Huff { count, sym })
    }
    fn decode(&self, br: &mut Bits) -> Result<u16, String> {
        let (mut code, mut first, mut index) = (0i32, 0i32, 0i32);
        for l in 1..16 {
            code |= br.take(1)? as i32;
            let c = self.count[l] as i32;
            if code - c < first {
                return self
                    .sym
                    .get((index + code - first) as usize)
                    .copied()
                    .ok_or_else(|| "inflate: bad code".into());
            }
            index += c;
            first += c;
            first <<= 1;
            code <<= 1;
        }
        Err("inflate: bad code".into())
    }
}

const LBASE: [u16; 29] = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
    163, 195, 227, 258,
];
const LEXT: [u8; 29] = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DBASE: [u16; 30] = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537,
    2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DEXT: [u8; 30] = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13,
    13,
];
const ORDER: [usize; 19] = [
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

fn codes(
    br: &mut Bits,
    out: &mut Vec<u8>,
    lit: &Huff,
    dist: &Huff,
    cap: usize,
) -> Result<(), String> {
    loop {
        let s = lit.decode(br)? as usize;
        if s < 256 {
            if out.len() >= cap {
                return Err("inflate: output over the size cap".into());
            }
            room(out, 1)?;
            out.push(s as u8);
        } else if s == 256 {
            return Ok(());
        } else {
            let i = s - 257;
            if i >= 29 {
                return Err("inflate: bad length code".into());
            }
            let len = LBASE[i] as usize + br.take(LEXT[i] as u32)? as usize;
            let d = dist.decode(br)? as usize;
            if d >= 30 {
                return Err("inflate: bad distance code".into());
            }
            let dd = DBASE[d] as usize + br.take(DEXT[d] as u32)? as usize;
            if dd > out.len() {
                return Err("inflate: distance before the start".into());
            }
            if out.len() + len > cap {
                return Err("inflate: output over the size cap".into());
            }
            room(out, len)?;
            let st = out.len() - dd;
            for k in 0..len {
                let b = out[st + k];
                out.push(b);
            }
        }
    }
}

/// Grows `out` for `extra` more bytes with a fallible reservation, so a
/// large archive returns an error instead of aborting when memory runs
/// out (an abort traps the whole wasm instance).
fn room(out: &mut Vec<u8>, extra: usize) -> Result<(), String> {
    if out.capacity() - out.len() >= extra {
        return Ok(());
    }
    out.try_reserve(extra.max(out.len()))
        .map_err(|_| format!("inflate: out of memory at {} bytes", out.len()))
}

/// Raw DEFLATE data to bytes, at most `cap` bytes out.
pub fn inflate_raw(data: &[u8], cap: usize) -> Result<Vec<u8>, String> {
    let mut br = Bits {
        b: data,
        pos: 0,
        bit: 0,
        nbits: 0,
    };
    let mut out = Vec::new();
    loop {
        let last = br.take(1)?;
        match br.take(2)? {
            0 => {
                br.align();
                let h = data
                    .get(br.pos..br.pos + 4)
                    .ok_or("inflate: short stored block")?;
                let len = u16::from_le_bytes([h[0], h[1]]) as usize;
                let nlen = u16::from_le_bytes([h[2], h[3]]);
                if nlen != !(len as u16) {
                    return Err("inflate: stored length check failed".into());
                }
                br.pos += 4;
                let blk = data
                    .get(br.pos..br.pos + len)
                    .ok_or("inflate: short stored block")?;
                if out.len() + len > cap {
                    return Err("inflate: output over the size cap".into());
                }
                room(&mut out, len)?;
                out.extend_from_slice(blk);
                br.pos += len;
            }
            1 => {
                let mut l = [0u8; 288];
                l[..144].fill(8);
                l[144..256].fill(9);
                l[256..280].fill(7);
                l[280..].fill(8);
                let lit = Huff::new(&l)?;
                let dist = Huff::new(&[5u8; 30])?;
                codes(&mut br, &mut out, &lit, &dist, cap)?;
            }
            2 => {
                let nlen = br.take(5)? as usize + 257;
                let ndist = br.take(5)? as usize + 1;
                let ncode = br.take(4)? as usize + 4;
                if nlen > 286 || ndist > 30 {
                    return Err("inflate: bad table counts".into());
                }
                let mut cl = [0u8; 19];
                for &o in ORDER.iter().take(ncode) {
                    cl[o] = br.take(3)? as u8;
                }
                let clh = Huff::new(&cl)?;
                let mut lens = vec![0u8; nlen + ndist];
                let mut i = 0;
                while i < nlen + ndist {
                    let s = clh.decode(&mut br)?;
                    let (v, rep) = match s {
                        0..=15 => (s as u8, 1),
                        16 => {
                            if i == 0 {
                                return Err("inflate: repeat with no previous length".into());
                            }
                            (lens[i - 1], 3 + br.take(2)? as usize)
                        }
                        17 => (0, 3 + br.take(3)? as usize),
                        _ => (0, 11 + br.take(7)? as usize),
                    };
                    if i + rep > nlen + ndist {
                        return Err("inflate: too many lengths".into());
                    }
                    lens[i..i + rep].fill(v);
                    i += rep;
                }
                if lens[256] == 0 {
                    return Err("inflate: no end of block code".into());
                }
                let lit = Huff::new(&lens[..nlen])?;
                let dist = Huff::new(&lens[nlen..])?;
                codes(&mut br, &mut out, &lit, &dist, cap)?;
            }
            _ => return Err("inflate: bad block type".into()),
        }
        if last == 1 {
            return Ok(out);
        }
    }
}

/// zlib wrapped DEFLATE, with the header and Adler-32 checked.
pub fn inflate_zlib(data: &[u8], cap: usize) -> Result<Vec<u8>, String> {
    if data.len() < 6
        || data[0] & 0x0f != 8
        || (u16::from(data[0]) << 8 | u16::from(data[1])) % 31 != 0
        || data[1] & 0x20 != 0
    {
        return Err("inflate: bad zlib header".into());
    }
    let out = inflate_raw(&data[2..], cap)?;
    let n = data.len();
    let want = u32::from_be_bytes([data[n - 4], data[n - 3], data[n - 2], data[n - 1]]);
    if crate::bytes::adler32(&out) != want {
        return Err("inflate: adler-32 mismatch".into());
    }
    Ok(out)
}

/// zlib wrapping of stored blocks: valid zlib data with no compression,
/// used for generated PNG pixel data.
pub fn zlib_stored(data: &[u8]) -> Vec<u8> {
    let mut out = vec![0x78, 0x01];
    let mut chunks = data.chunks(65535).peekable();
    if chunks.peek().is_none() {
        out.extend_from_slice(&[1, 0, 0, 0xff, 0xff]);
    }
    while let Some(c) = chunks.next() {
        out.push(if chunks.peek().is_none() { 1 } else { 0 });
        let n = c.len() as u16;
        out.extend_from_slice(&n.to_le_bytes());
        out.extend_from_slice(&(!n).to_le_bytes());
        out.extend_from_slice(c);
    }
    out.extend_from_slice(&crate::bytes::adler32(data).to_be_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // Streams made by zlib.deflateRawSync in Node 22.18.0 (fixed and dynamic
    // Huffman blocks); the expected text is in the test.
    const FIXED: &[u8] = &[
        0xcb, 0x48, 0xcd, 0xc9, 0xc9, 0x57, 0x28, 0xcf, 0x2f, 0xca, 0x49, 0x01, 0x00,
    ];

    pub const DYNAMIC: &[u8] = &[
        0xed, 0x8e, 0x4b, 0x0e, 0xc2, 0x30, 0x0c, 0x44, 0xaf, 0xe2, 0x03, 0x20, 0xc4, 0xa7, 0xfc,
        0x8e, 0xe3, 0xa6, 0xa6, 0x09, 0x49, 0xda, 0x60, 0x3b, 0x0d, 0xe5, 0xf4, 0x88, 0x96, 0x4d,
        0x57, 0xac, 0xd8, 0xb1, 0x9c, 0xd1, 0xd3, 0xcc, 0x53, 0x4b, 0xe0, 0x89, 0x12, 0x31, 0x98,
        0xe0, 0x62, 0x2d, 0xa0, 0x96, 0x40, 0x14, 0x1d, 0x03, 0x2a, 0x34, 0x59, 0xfc, 0x7a, 0xaa,
        0x3e, 0x90, 0xb2, 0x8b, 0x33, 0x53, 0x9c, 0xf1, 0x4b, 0x24, 0x60, 0x4c, 0xa0, 0x99, 0x3b,
        0x59, 0x7d, 0xc9, 0xd0, 0x0f, 0xef, 0x2d, 0x4b, 0xd0, 0x32, 0x8d, 0x50, 0x50, 0x89, 0xa1,
        0x58, 0x17, 0x68, 0x2a, 0x0d, 0x2a, 0x48, 0x20, 0x4a, 0x02, 0x7d, 0x37, 0x9f, 0x21, 0x47,
        0x68, 0x03, 0x8a, 0x2c, 0x6c, 0xfe, 0xca, 0x3f, 0x53, 0xde, 0x6c, 0x77, 0xfb, 0xea, 0x70,
        0x3c, 0x9d, 0x2f, 0x58, 0x9b, 0x86, 0xae, 0xad, 0x75, 0x37, 0x1f, 0x62, 0xd7, 0xa7, 0x3b,
        0x8b, 0xe6, 0xa1, 0x3c, 0xc6, 0xe7, 0x0b,
    ];
    pub fn dynamic_text() -> Vec<u8> {
        let line = "the keeper climbs the stair at dusk. the keeper trims the wick at dusk. the lamp turns, the lamp turns, the lamp turns over the grey water while the cat sleeps on the warm glass. ";
        let mut t = line.repeat(3);
        t.push_str("0123456789abcdefghijklmnopqrstuvwxyz");
        t.into_bytes()
    }

    #[test]
    fn dynamic_block() {
        assert_eq!(inflate_raw(DYNAMIC, MAX_OUT).unwrap(), dynamic_text());
    }

    #[test]
    fn fixed_block() {
        assert_eq!(inflate_raw(FIXED, MAX_OUT).unwrap(), b"hello world");
    }

    #[test]
    fn stored_round_trip() {
        let data: Vec<u8> = (0..70000u32).map(|i| (i * 7 % 251) as u8).collect();
        assert_eq!(inflate_zlib(&zlib_stored(&data), MAX_OUT).unwrap(), data);
        assert_eq!(
            inflate_zlib(&zlib_stored(&[]), MAX_OUT).unwrap(),
            Vec::<u8>::new()
        );
    }

    #[test]
    fn caps_and_errors() {
        let data = vec![0u8; 1000];
        assert!(inflate_zlib(&zlib_stored(&data), 10).is_err());
        assert!(inflate_raw(&[0xff], MAX_OUT).is_err());
        let mut z = zlib_stored(b"abc");
        let n = z.len();
        z[n - 1] ^= 1;
        assert!(inflate_zlib(&z, MAX_OUT).is_err());
    }
}
