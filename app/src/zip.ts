/* A .zip of a few small text files: the exports write one, and opening one
 * reads it back.
 *
 * Each file is written as it is, not compressed: the files are a few tens of
 * kB, and any unzip tool opens a stored file. Reading takes a stored file,
 * or one deflated by another tool, through the browser's own decompressor.
 * The format is PKWARE's APPNOTE: a local header and the data for each
 * file, then a central directory that lists them, then its end record.
 * Names are UTF-8.
 */

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The time and date fields, in MS-DOS form, for `at`. */
function dos(at: Date): { time: number; date: number } {
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: (Math.max(at.getFullYear(), 1980) - 1980) << 9 | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

export function zip(files: readonly ZipFile[], at = new Date()): Blob {
  const enc = new TextEncoder(), { time, date } = dos(at);
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    // Bit 11: the name is UTF-8.
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, size, true);
    dir.setUint32(24, size, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + size;
  }
  const dirSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: "application/zip" });
}

/** The files in a .zip, read from its central directory. Folders are left
 *  out. Throws on a file that is not a .zip, or one packed some other way
 *  than stored or deflated. */
export async function unzip(blob: Blob): Promise<ZipFile[]> {
  const buf = new Uint8Array(await blob.arrayBuffer()), v = new DataView(buf.buffer);
  // The end record: 22 bytes, after a comment of up to 64 kB.
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Not a .zip file.");
  const dec = new TextDecoder(), count = v.getUint16(end + 10, true), out: ZipFile[] = [];
  let at = v.getUint32(end + 16, true);
  for (let n = 0; n < count; n++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error("The .zip's directory is damaged.");
    const method = v.getUint16(at + 10, true), packed = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), note = v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true), name = dec.decode(buf.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extra + note;
    if (name.endsWith("/")) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = buf.slice(start, start + packed);
    if (method === 0) out.push({ name, data: raw });
    else if (method === 8) out.push({ name, data: new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()) });
    else throw new Error(`${name} is packed in a way NanoBands can't read.`);
  }
  return out;
}
