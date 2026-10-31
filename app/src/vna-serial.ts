/* Web Serial: the NanoVNA's USB port as a Link.
 *
 * The NanoVNA is a USB serial device (CDC-ACM), and the operating system
 * claims it, so WebUSB cannot open it. Web Serial can, in desktop Chrome, Edge
 * and Opera, on an https page or localhost. One program at a time holds the
 * port, so NanoVNA-Saver must be closed first.
 */

import type { Link } from "./vna";

/* The parts of the Web Serial API the page uses. TypeScript's DOM types do
   not include it yet. */
export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
}

export interface SerialLike {
  requestPort(options?: { filters: { usbVendorId: number; usbProductId?: number }[] }): Promise<SerialPortLike>;
}

/** The NanoVNA family's USB vendor and product IDs. */
export const NANOVNA_USB = { usbVendorId: 0x0483, usbProductId: 0x5740 };

/** Web Serial, or why this browser has none. */
export function serialApi(): SerialLike | string {
  if (!window.isSecureContext) return "Live sweeps need the page served over https.";
  const s = (navigator as Navigator & { serial?: SerialLike }).serial;
  return s ?? "Live sweeps need Chrome or Edge on a computer.";
}

/** Ask the user for the NanoVNA's port and open it. Null if they cancel. */
export async function connectPort(serial: SerialLike): Promise<Link | null> {
  let port: SerialPortLike;
  try {
    port = await serial.requestPort({ filters: [NANOVNA_USB] });
  } catch {
    return null; // the chooser was closed
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
  let closed = false;
  return {
    write: (text) => writer.write(enc.encode(text)),
    async read() {
      if (closed) return null;
      try {
        const { value, done } = await reader.read();
        if (done) return null;
        return dec.decode(value, { stream: true });
      } catch {
        return null; // unplugged
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      await writer.close().catch(() => undefined);
      writer.releaseLock();
      await port.close().catch(() => undefined);
    },
  };
}
