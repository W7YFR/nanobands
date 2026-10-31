/* The NanoVNA's USB shell: text commands in, text lines out.
 *
 * Send `cmd\r`. The device echoes the command, prints its result lines, then
 * prints the prompt `ch> `. A command it does not know answers `cmd?`. The
 * original NanoVNA, the -H, the -H4 and the -F family all speak this shell;
 * the V2, the SAA-2 and the LiteVNA speak a binary protocol and are not
 * supported.
 *
 * The page sweeps the range the device is set to, so its calibration applies
 * as stored. `recall` loads a saved calibration slot, and with it that slot's
 * range.
 */

/** A text channel to the device: a serial port, or the fake in tests. */
export interface Link {
  write(text: string): Promise<void>;
  /** The next chunk of text, or null when the link has closed. */
  read(): Promise<string | null>;
  close(): Promise<void>;
}

const PROMPT = "ch> ";

export class Shell {
  private buf = "";
  /** A read still waiting when a command timed out. The next command takes it over. */
  private pending: Promise<string | null> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /** `log` sees each command sent and each reply, for the console. */
  constructor(private readonly link: Link, private readonly log: (line: string) => void = () => undefined) {}

  /** Run a command and return the lines it printed, without its echo. */
  run(cmd: string, ms = 3000): Promise<string[]> {
    const job = this.queue.then(() => this.exec(cmd, ms));
    this.queue = job.catch(() => undefined);
    return job;
  }

  /** Get to a fresh prompt, past whatever the device printed before. */
  sync(): Promise<void> {
    const job = this.queue.then(async () => {
      this.log("> (return)");
      await this.link.write("\r");
      await this.untilPrompt(2000);
      // A port opened mid-reply, or a device that greets, can leave more
      // prompts on the way. Take everything that arrives in a short pause.
      for (;;) {
        const more = await this.untilPrompt(150, null).catch(() => null);
        if (more === null) break;
        this.log(`< (skipped) ${JSON.stringify(more)}`);
      }
      this.buf = "";
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async exec(cmd: string, ms: number): Promise<string[]> {
    this.log(`> ${cmd}`);
    await this.link.write(cmd + "\r");
    const deadline = performance.now() + ms;
    for (;;) {
      const raw = await this.untilPrompt(deadline - performance.now(), cmd);
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
      const echo = lines.indexOf(cmd);
      // No echo of this command: a reply left from before. Skip to the next prompt.
      if (echo < 0) { this.log(`< (skipped) ${preview(raw)}`); continue; }
      this.log(`< ${preview(raw)}`);
      const out = lines.slice(echo + 1);
      if (out.length === 1 && out[0] === `${cmd.split(" ")[0]}?`) {
        throw new VnaError(`The NanoVNA does not know the command "${cmd.split(" ")[0]}".`);
      }
      return out;
    }
  }

  /** Text up to the next prompt. `cmd` names the command for a timeout; null times out quietly. */
  private async untilPrompt(ms: number, cmd: string | null = ""): Promise<string> {
    const deadline = performance.now() + ms;
    for (;;) {
      const at = this.buf.indexOf(PROMPT);
      if (at >= 0) {
        const out = this.buf.slice(0, at);
        this.buf = this.buf.slice(at + PROMPT.length);
        return out;
      }
      const left = deadline - performance.now();
      if (left <= 0) {
        if (cmd !== null) this.log(`< (timed out) ${preview(this.buf)}`);
        throw new VnaError(cmd ? `The NanoVNA stopped answering "${cmd}".` : "The NanoVNA stopped answering.");
      }
      this.pending ??= this.link.read();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        this.pending,
        new Promise<"timeout">((res) => (timer = setTimeout(() => res("timeout"), left))),
      ]);
      clearTimeout(timer);
      if (chunk === "timeout") continue;
      this.pending = null;
      if (chunk === null) throw new VnaError("The NanoVNA disconnected.", true);
      this.buf += chunk;
    }
  }
}

/** A reply for the log: quoted, and cut short when it is a long sweep. */
const preview = (text: string): string => JSON.stringify(text.length > 240 ? `${text.slice(0, 240)}… (${text.length} chars)` : text);

export class VnaError extends Error {
  constructor(message: string, readonly closed = false) {
    super(message);
  }
}

/* ---------------- What the device says ---------------- */

export interface DeviceInfo {
  /** The board name from `info`, such as "NanoVNA-H 4". */
  board: string;
  /** The firmware version, such as "1.2.44". */
  version: string;
  /** Calibration slots `recall` can load. */
  slots: number;
  /** How to sweep: `scan` with an output mask (firmware 0.7.1 and later),
   *  `scan` then `data` (0.2.0 and later), or `sweep` then `data`. */
  method: "mask" | "scan" | "sweep";
}

/** The device's sweep: start and stop in Hz, and the number of points. */
export interface Range {
  start: number;
  stop: number;
  points: number;
}

/** One sweep: frequency in Hz and S11 as real and imaginary parts, per point. */
export interface Scan {
  hz: number[];
  re: number[];
  im: number[];
}

/** The version's numbers, from `1.2.44` or `0.4.5-2-gabc123`. */
export function versionParts(v: string): number[] {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(v);
  return m ? [+m[1]!, +m[2]!, +(m[3] ?? 0)] : [0, 0, 0];
}

export function versionAtLeast(v: string, min: string): boolean {
  const a = versionParts(v), b = versionParts(min);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return true;
}

/** Read `info` and `version` into what the page needs. */
export function parseInfo(info: string[], version: string[]): DeviceInfo {
  const text = info.join("\n");
  if (/tinySA/i.test(text)) throw new VnaError("This is a tinySA, not a NanoVNA.");
  const board = /Board:\s*(.+)/.exec(text)?.[1]?.trim()
    ?? ["NanoVNA-H 4", "NanoVNA-H", "NanoVNA-F_V3", "NanoVNA-F_V2", "NanoVNA-F", "NanoVNA"].find((b) => text.includes(b))
    ?? "NanoVNA";
  const v = version[0]?.trim() || /Version:\s*(\S+)/.exec(text)?.[1] || "0.0.0";
  const method = versionAtLeast(v, "0.7.1") ? "mask" : versionAtLeast(v, "0.2.0") ? "scan" : "sweep";
  // The H4 keeps seven calibrations; the others keep five.
  return { board, version: v, slots: /H 4|H4/.test(board) ? 7 : 5, method };
}

/** Read the reply to `sweep` with no arguments: `start stop points`. */
export function parseRange(lines: string[]): Range | null {
  const n = (lines[0] ?? "").trim().split(/\s+/).map(Number);
  if (n.length < 3 || n.some((x) => !Number.isFinite(x))) return null;
  const [start = 0, stop = 0, points = 0] = n;
  return stop > start && points >= 2 ? { start, stop, points } : null;
}

/** Read `scan` output with mask 3: `freq re im` per line. */
export function parseMaskScan(lines: string[]): Scan {
  const out: Scan = { hz: [], re: [], im: [] };
  for (const l of lines) {
    const n = l.trim().split(/\s+/).map(Number);
    if (n.length < 3 || n.some((x) => !Number.isFinite(x))) continue;
    out.hz.push(n[0]!); out.re.push(n[1]!); out.im.push(n[2]!);
  }
  return out;
}

/** Pair `frequencies` (one per line) with `data 0` (`re im` per line). */
export function parseDataScan(freqs: string[], data: string[]): Scan {
  const out: Scan = { hz: [], re: [], im: [] };
  const n = Math.min(freqs.length, data.length);
  for (let i = 0; i < n; i++) {
    const f = Number(freqs[i]), d = data[i]!.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(f) || d.length < 2 || d.some((x) => !Number.isFinite(x))) continue;
    out.hz.push(f); out.re.push(d[0]!); out.im.push(d[1]!);
  }
  return out;
}

/** A sweep as a Touchstone .s1p file. */
export function toTouchstone(s: Scan, board = "NanoVNA"): string {
  let t = `! ${board} sweep, saved by NanoBands\n# Hz S RI R 50\n`;
  for (let i = 0; i < s.hz.length; i++) t += `${s.hz[i]} ${s.re[i]} ${s.im[i]}\n`;
  return t;
}

/* ---------------- The device ---------------- */

/** How long a sweep may take. A narrow IF bandwidth makes it slow. */
const SCAN_MS = 120_000;

export class NanoVNA {
  private constructor(private readonly sh: Shell, private readonly link: Link, readonly info: DeviceInfo) {}

  static async open(link: Link, log?: (line: string) => void): Promise<NanoVNA> {
    const sh = new Shell(link, log);
    try {
      await sh.sync();
      const info = parseInfo(await sh.run("info"), await sh.run("version"));
      return new NanoVNA(sh, link, info);
    } catch (e) {
      await link.close().catch(() => undefined);
      throw e instanceof VnaError ? e : new VnaError("That port did not answer like a NanoVNA.");
    }
  }

  /** The range the device is set to. */
  async range(): Promise<Range> {
    const said = await this.sh.run("sweep");
    const r = parseRange(said);
    if (r) return r;
    // Firmware that does not print its range still lists its frequencies.
    const f = (await this.sh.run("frequencies")).map(Number).filter(Number.isFinite);
    if (f.length < 2) throw new VnaError(`Couldn't read the NanoVNA's sweep range. It answered "sweep" with ${JSON.stringify(said.join(" / "))}.`);
    return { start: f[0]!, stop: f[f.length - 1]!, points: f.length };
  }

  /** Load a saved calibration, and the range saved with it. */
  async recall(slot: number): Promise<Range> {
    await this.sh.run(`recall ${slot}`, 5000);
    return this.range();
  }

  /** Sweep a range and read S11. */
  async scan(r: Range): Promise<Scan> {
    const args = `${Math.round(r.start)} ${Math.round(r.stop)} ${r.points}`;
    if (this.info.method === "mask") return parseMaskScan(await this.sh.run(`scan ${args} 3`, SCAN_MS));
    await this.sh.run(`${this.info.method} ${args}`, SCAN_MS);
    return parseDataScan(await this.sh.run("frequencies"), await this.sh.run("data 0", 10_000));
  }

  close(): Promise<void> {
    return this.link.close();
  }
}
