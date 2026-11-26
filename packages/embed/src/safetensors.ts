/**
 * A safetensors reader: an 8 byte little endian header length, a JSON
 * header naming each tensor's dtype, shape and byte range, then the data.
 * Floats come out as Float32Array; F16 and BF16 are widened.
 */

/** One tensor read from a safetensors file: dtype, shape and its values. */
export interface Tensor {
  dtype: string;
  shape: number[];
  data: Float32Array | Int32Array;
}

/** A parsed safetensors file: tensor names, header metadata and a getter by name. */
export interface SafeTensors {
  names: string[];
  metadata: Record<string, string>;
  get(name: string): Tensor | null;
}

/** IEEE half to float, exact for every half value. */
export function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}

/** Parse safetensors bytes; floats come out as Float32Array, integers as Int32Array. */
export function readSafetensors(buf: ArrayBuffer | Uint8Array): SafeTensors {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 8) throw new Error("safetensors: file shorter than its header length");
  const n = Number(dv.getBigUint64(0, true));
  if (8 + n > u8.byteLength) throw new Error("safetensors: header runs past the end of the file");
  const header = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n))) as Record<string, unknown>;
  const base = 8 + n;
  const metadata = (header.__metadata__ ?? {}) as Record<string, string>;
  const names = Object.keys(header).filter((k) => k !== "__metadata__");
  return {
    names,
    metadata,
    get(name) {
      const h = header[name] as { dtype: string; shape: number[]; data_offsets: [number, number] } | undefined;
      if (!h) return null;
      const [b, e] = h.data_offsets;
      const off = base + b;
      const count = h.shape.reduce((a, x) => a * x, 1);
      const rd = new DataView(u8.buffer, u8.byteOffset + off, e - b);
      switch (h.dtype) {
        case "F32": {
          const d = new Float32Array(count);
          for (let i = 0; i < count; i++) d[i] = rd.getFloat32(i * 4, true);
          return { dtype: h.dtype, shape: h.shape, data: d };
        }
        case "F16": {
          const d = new Float32Array(count);
          for (let i = 0; i < count; i++) d[i] = halfToFloat(rd.getUint16(i * 2, true));
          return { dtype: h.dtype, shape: h.shape, data: d };
        }
        case "BF16": {
          const d = new Float32Array(count);
          const tmp = new DataView(new ArrayBuffer(4));
          for (let i = 0; i < count; i++) {
            tmp.setUint32(0, rd.getUint16(i * 2, true) << 16, true);
            d[i] = tmp.getFloat32(0, true);
          }
          return { dtype: h.dtype, shape: h.shape, data: d };
        }
        case "I32": {
          const d = new Int32Array(count);
          for (let i = 0; i < count; i++) d[i] = rd.getInt32(i * 4, true);
          return { dtype: h.dtype, shape: h.shape, data: d };
        }
        case "I64": {
          const d = new Int32Array(count);
          for (let i = 0; i < count; i++) d[i] = Number(rd.getBigInt64(i * 8, true));
          return { dtype: h.dtype, shape: h.shape, data: d };
        }
        default:
          throw new Error(`safetensors: dtype ${h.dtype} of ${name} is not supported`);
      }
    },
  };
}
