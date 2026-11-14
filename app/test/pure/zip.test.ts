/* The .zip the exports save: its checksums, and a layout any unzip tool reads. */

import { describe, expect, it } from "vitest";
import { crc32, zip } from "@/zip";

const enc = new TextEncoder(), dec = new TextDecoder();

describe("crc32", () => {
  it("gives the standard check value", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("zip", () => {
  it("stores each file whole, and lists them in its central directory", async () => {
    const files = [{ name: "a.s1p", data: enc.encode("# Hz S RI R 50\n1 0 0\n") }, { name: "b-kept1.s1p", data: enc.encode("second") }];
    const buf = new Uint8Array(await zip(files, new Date(2026, 10, 14, 12, 30)).arrayBuffer()), v = new DataView(buf.buffer);
    // The end record: two files, and where the directory starts.
    const end = buf.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    let at = v.getUint32(end + 16, true);
    const read: { name: string; text: string }[] = [];
    for (let i = 0; i < 2; i++) {
      expect(v.getUint32(at, true)).toBe(0x02014b50);
      const size = v.getUint32(at + 24, true), nameLen = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true);
      const name = dec.decode(buf.slice(at + 46, at + 46 + nameLen));
      // The local header holds the same name; the data follows it, stored.
      expect(v.getUint32(local, true)).toBe(0x04034b50);
      expect(v.getUint16(local + 8, true)).toBe(0);
      const start = local + 30 + v.getUint16(local + 26, true), data = buf.slice(start, start + size);
      expect(crc32(data)).toBe(v.getUint32(at + 16, true));
      read.push({ name, text: dec.decode(data) });
      at += 46 + nameLen;
    }
    expect(read).toEqual(files.map((f) => ({ name: f.name, text: dec.decode(f.data) })));
  });
});
