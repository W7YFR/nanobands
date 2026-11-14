/* Web Serial: the NanoVNA's USB port as a Link.
 *
 * The NanoVNA is a USB serial device (CDC-ACM), and the operating system
 * claims it, so WebUSB cannot open it. Web Serial can, in desktop Chrome, Edge
 * and Opera, on an https page or localhost. One program at a time holds the
 * port, so NanoVNA-Saver must be closed first.
 *
 * A port the page opened before needs no chooser: Connect and Reconnect open
 * it at once. A port says `disconnect` when its device goes away, unplugged
 * or turned off, and the link passes that on.
 */

import type { Link } from "./vna";

/* The parts of the Web Serial API the page uses. TypeScript's DOM types do
   not include it yet. */
export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  addEventListener?(type: "disconnect", listener: () => void): void;
  removeEventListener?(type: "disconnect", listener: () => void): void;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}

export interface SerialLike {
  requestPort(options?: { filters: { usbVendorId: number; usbProductId?: number }[] }): Promise<SerialPortLike>;
  /** The ports the page may open without asking, because it opened them before. */
  getPorts?(): Promise<SerialPortLike[]>;
}

/** The NanoVNA family's USB vendor and product IDs. */
export const NANOVNA_USB = { usbVendorId: 0x0483, usbProductId: 0x5740 };

/** Web Serial, or why this browser has none. */
export function serialApi(): SerialLike | string {
  if (!window.isSecureContext) return "Live sweeps need the page served over https.";
  const s = (navigator as Navigator & { serial?: SerialLike }).serial;
  return s ?? "Live sweeps need Chrome or Edge on a computer.";
}

/** Open the NanoVNA's port: the one the page opened before, or the one the
 *  user picks. Null if they cancel. */
export async function connectPort(serial: SerialLike): Promise<Link | null> {
  const known = ((await serial.getPorts?.().catch(() => [])) ?? []).filter((p) => {
    const i = p.getInfo?.();
    return i?.usbVendorId === NANOVNA_USB.usbVendorId && i.usbProductId === NANOVNA_USB.usbProductId;
  });
  let port: SerialPortLike;
  if (known.length === 1) port = known[0]!;
  else {
    try {
      port = await serial.requestPort({ filters: [NANOVNA_USB] });
    } catch {
      return null; // the chooser was closed
    }
  }
  try {
    // The port is USB, so the baud rate is ignored; the firmware expects one anyway.
    await port.open({ baudRate: 115200 });
  } catch {
    throw new Error("Couldn't open the NanoVNA's port. Quit NanoVNA-Saver or any other app using it, then try again.");
  }
  return portLink(port);
}

export function portLink(port: SerialPortLike): Link {
  const reader = port.readable!.getReader(), writer = port.writable!.getWriter();
  const dec = new TextDecoder(), enc = new TextEncoder();
  let closed = false, goneNow = (): void => undefined;
  const gone = new Promise<void>((res) => { goneNow = res; });
  const onGone = (): void => goneNow();
  port.addEventListener?.("disconnect", onGone);
  return {
    gone,
    write: (text) => writer.write(enc.encode(text)),
    async read() {
      if (closed) return null;
      try {
        const { value, done } = await reader.read();
        if (done) return null;
        return dec.decode(value, { stream: true });
      } catch {
        goneNow();
        return null; // unplugged
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      port.removeEventListener?.("disconnect", onGone);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      await writer.close().catch(() => undefined);
      writer.releaseLock();
      await port.close().catch(() => undefined);
    },
  };
}
