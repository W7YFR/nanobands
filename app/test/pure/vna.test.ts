/* The NanoVNA shell, against the stand-in device. The replies it parses are
 * the ones a NanoVNA-H4 on firmware 1.2.44 gave. */

import { describe, expect, it } from "vitest";
import { parseTouchstone } from "@/touchstone";
import {
  NanoVNA, parseDataScan, parseInfo, parseMaskScan, parseRange, Shell, toTouchstone, versionAtLeast, type Link,
} from "@/vna";
import { FakeNanoVNA, fakeSwr } from "@/vna-fake";

/** Real `info` output from the H4. */
const H4_INFO = [
  "Board: NanoVNA-H 4", "2019-2025 Copyright NanoVNA.com", "based on  @DiSlord @edy555 ... source", "Licensed under GPL.",
  "Version: 1.2.44 [p:401, IF:12k, ADC:384k, Lcd:480x320]", "Build Time: May 26 2025 - 16:00:15",
  "Architecture: ARMv7E-M Core Variant: Cortex-M4F", "Platform: STM32F303xC Analog & DSP",
];

describe("parseInfo", () => {
  it("reads the H4's board, version and slots", () => {
    expect(parseInfo(H4_INFO, ["1.2.44"])).toEqual({ board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" });
  });

  it("picks the sweep method from the version", () => {
    expect(parseInfo(["Kernel: 4.0.0"], ["0.4.5-2-gabc123"])).toMatchObject({ board: "NanoVNA", method: "scan", slots: 5 });
    expect(parseInfo(["NanoVNA-H"], ["0.1.0"]).method).toBe("sweep");
    expect(parseInfo(["NanoVNA-F_V2"], ["0.7.1"]).method).toBe("mask");
  });

  it("refuses a tinySA", () => {
    expect(() => parseInfo(["tinySA4 v1.4"], ["1.4"])).toThrow(/tinySA/);
  });

  it("compares versions by number", () => {
    expect(versionAtLeast("1.2.44", "0.7.1")).toBe(true);
    expect(versionAtLeast("0.7.0", "0.7.1")).toBe(false);
    expect(versionAtLeast("0.10.0", "0.7.1")).toBe(true);
  });
});

describe("the parsers", () => {
  it("reads the range `sweep` prints", () => {
    expect(parseRange(["3000000 55000000 401"])).toEqual({ start: 3e6, stop: 55e6, points: 401 });
    expect(parseRange(["usage: sweep {start(Hz)} [stop(Hz)] [points]"])).toBeNull();
  });

  it("reads masked scan lines and pairs frequencies with data", () => {
    expect(parseMaskScan(["3000000 0.5 -0.1", "junk", "3130000 0.4 0.2"])).toEqual({ hz: [3e6, 3.13e6], re: [0.5, 0.4], im: [-0.1, 0.2] });
    expect(parseDataScan(["3000000", "3130000"], ["0.5 -0.1", "0.4 0.2"]).hz).toEqual([3e6, 3.13e6]);
  });

  it("writes a sweep the Touchstone reader takes back", () => {
    const { f, s } = parseTouchstone(toTouchstone({ hz: [7.1e6, 14.2e6], re: [0.5, 0], im: [0, 0.2] }, "NanoVNA-H 4"));
    expect(f).toEqual([7.1, 14.2]);
    expect(s[0]).toBeCloseTo(3);
    expect(s[1]).toBeCloseTo(1.5);
  });
});

describe("Shell", () => {
  it("drops the echo, joins split replies, and waits for the prompt", async () => {
    const chunks = ["inf", "o\r\nBoard: NanoVNA-H 4\r\nVers", "ion: 1.2.44\r\nch", "> "];
    const link: Link = { write: async () => undefined, read: async () => chunks.shift() ?? null, close: async () => undefined };
    expect(await new Shell(link).run("info")).toEqual(["Board: NanoVNA-H 4", "Version: 1.2.44"]);
  });

  it("says when the device does not know a command", async () => {
    const sh = new Shell(new FakeNanoVNA().link());
    await expect(sh.run("exit")).rejects.toThrow('does not know the command "exit"');
  });

  it("gives up on a device that stops answering", async () => {
    const link: Link = { write: async () => undefined, read: () => new Promise(() => undefined), close: async () => undefined };
    await expect(new Shell(link).run("info", 50)).rejects.toThrow("stopped answering");
  });

  it("says when the device is unplugged", async () => {
    const link: Link = { write: async () => undefined, read: async () => null, close: async () => undefined };
    await expect(new Shell(link).run("info")).rejects.toMatchObject({ closed: true });
  });

  it("skips a reply left from before the command", async () => {
    const chunks = ["version\r\n1.2.44\r\nch> ", "sweep\r\n3000000 55000000 401\r\nch> "];
    const link: Link = { write: async () => undefined, read: async () => chunks.shift() ?? null, close: async () => undefined };
    expect(await new Shell(link).run("sweep")).toEqual(["3000000 55000000 401"]);
  });

  it("logs what it sends and what comes back", async () => {
    const log: string[] = [];
    await new Shell(new FakeNanoVNA().link(), (l) => log.push(l)).run("version");
    expect(log).toEqual(["> version", '< "version\\r\\n1.2.44\\r\\n"']);
  });

  it("runs commands one at a time", async () => {
    const sh = new Shell(new FakeNanoVNA().link());
    const [a, b] = await Promise.all([sh.run("version"), sh.run("sweep")]);
    expect(a).toEqual(["1.2.44"]);
    expect(b).toEqual(["3000000 55000000 401"]);
  });
});

describe("NanoVNA", () => {
  it("identifies the device and reads its range", async () => {
    const vna = await NanoVNA.open(new FakeNanoVNA().link());
    expect(vna.info.board).toBe("NanoVNA-H 4");
    expect(await vna.range()).toEqual({ start: 3e6, stop: 55e6, points: 401 });
  });

  it("opens a port with old replies and extra prompts waiting on it", async () => {
    const dev = new FakeNanoVNA({ stale: "\r\nch> \r\nch> version\r\n1.2.44\r\nch> " });
    const vna = await NanoVNA.open(dev.link());
    expect(vna.info.version).toBe("1.2.44");
    expect(await vna.range()).toEqual({ start: 3e6, stop: 55e6, points: 401 });
  });

  it("sweeps the range with one masked scan", async () => {
    const dev = new FakeNanoVNA();
    const vna = await NanoVNA.open(dev.link());
    const s = await vna.scan(await vna.range());
    expect(s.hz).toHaveLength(401);
    expect(s.hz[0]).toBe(3e6);
    expect(s.hz[400]).toBe(55e6);
    expect(dev.log).toContain("scan 3000000 55000000 401 3");
    const i = s.hz.findIndex((f) => f >= 14.2e6), g = Math.hypot(s.re[i]!, s.im[i]!);
    expect((1 + g) / (1 - g)).toBeCloseTo(fakeSwr(s.hz[i]!), 6);
  });

  it("loads a calibration slot and its range", async () => {
    const vna = await NanoVNA.open(new FakeNanoVNA().link());
    expect(await vna.recall(1)).toEqual({ start: 144e6, stop: 148e6, points: 101 });
  });

  it("sweeps older firmware with scan, frequencies and data", async () => {
    const dev = new FakeNanoVNA({ board: "NanoVNA", version: "0.4.5" });
    const vna = await NanoVNA.open(dev.link());
    const s = await vna.scan({ start: 1.8e6, stop: 30e6, points: 101 });
    expect(dev.log.slice(-3)).toEqual(["scan 1800000 30000000 101", "frequencies", "data 0"]);
    expect(s.hz).toHaveLength(101);
    expect(s.hz[100]).toBe(30e6);
  });

  it("refuses a port that does not answer like a NanoVNA", async () => {
    let closed = false;
    const link: Link = { write: async () => undefined, read: async () => "garbage", close: async () => { closed = true; } };
    await expect(NanoVNA.open(link)).rejects.toThrow();
    expect(closed).toBe(true);
  });
});
