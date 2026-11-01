/* The Shell window: a prompt to the NanoVNA over the whole page. A typed
 * command goes to the device and its reply shows above the prompt. The "?"
 * opens the list of commands beside the prompt, and a click on one puts it
 * in the prompt. The window refuses commands that take over the port. Live
 * sweeps stop while it is open, and the page reads the device's range again
 * when it closes.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { refusal, SHELL_COMMANDS } from "@/shell";
import type { Vna } from "./useVna";

export interface ShellEntry {
  kind: "cmd" | "out" | "err";
  text: string;
}

/** The most lines the window keeps. */
const KEEP = 5000;

export function ShellWindow({ vna, entries, onEntries, history, onClose }: {
  vna: Vna;
  entries: ShellEntry[];
  onEntries(f: (e: ShellEntry[]) => ShellEntry[]): void;
  /** The commands typed so far, oldest first. Up and Down step through them. */
  history: string[];
  onClose(): void;
}): React.ReactElement {
  const [line, setLine] = useState("");
  const [running, setRunning] = useState(false);
  const [help, setHelp] = useState(false);
  const back = useRef(-1);
  const input = useRef<HTMLInputElement>(null), log = useRef<HTMLPreElement>(null);
  const d = vna.device;

  const add = (more: ShellEntry[]): void => onEntries((e) => [...e, ...more].slice(-KEEP));

  // The page behind does not scroll while the window is open.
  useEffect(() => {
    document.documentElement.classList.add("shell-open");
    return () => document.documentElement.classList.remove("shell-open");
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent): void => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  useLayoutEffect(() => {
    const l = log.current;
    if (l) l.scrollTop = l.scrollHeight;
  }, [entries]);

  useEffect(() => { if (!running) input.current?.focus(); }, [running]);

  const run = async (): Promise<void> => {
    const cmd = line.trim();
    setLine("");
    back.current = -1;
    if (!cmd) return;
    if (cmd === "?") { setHelp(true); return; }
    if (history[history.length - 1] !== cmd) history.push(cmd);
    add([{ kind: "cmd", text: cmd }]);
    const no = refusal(cmd);
    if (no) { add([{ kind: "err", text: `Not sent. ${no}` }]); return; }
    setRunning(true);
    try {
      const out = await vna.command(cmd);
      add(out.map((text) => ({ kind: "out", text })));
    } catch (e) {
      add([{ kind: "err", text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setRunning(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") { e.preventDefault(); void run(); return; }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (!history.length) return;
    const at = back.current < 0 ? history.length : back.current;
    const next = e.key === "ArrowUp" ? Math.max(0, at - 1) : at + 1;
    back.current = next >= history.length ? -1 : next;
    setLine(back.current < 0 ? "" : history[back.current]!);
  };

  const pick = (name: string, args: string): void => {
    setLine(args ? `${name} ` : name);
    input.current?.focus();
  };

  return createPortal(
    <div id="shell" role="dialog" aria-modal="true" aria-labelledby="shellTitle">
      <div className="shell-head">
        <h2 id="shellTitle">Shell</h2>
        <span className="shell-sub">{d ? <><b>{d.info.board}</b> · firmware {d.info.version}</> : "Not connected"}</span>
        <button type="button" className={"help shell-q" + (help ? " shown" : "")} aria-label="Commands"
          aria-expanded={help} aria-controls="shellHelp" onClick={() => setHelp(!help)}>
          <span className="glyph">?</span>
        </button>
        <button type="button" className="small" onClick={() => onEntries(() => [])} disabled={!entries.length}>Clear</button>
        <button type="button" className="small" onClick={onClose}>Close</button>
      </div>
      <div className="shell-body">
        <div className="term">
          <pre className="term-log" ref={log} aria-live="polite">
            {entries.map((e, i) => (
              <div key={i} className={e.kind}>{e.kind === "cmd" ? `ch> ${e.text}` : e.text}</div>
            ))}
          </pre>
          <label className="term-line">
            <span aria-hidden="true">ch&gt;</span>
            <input ref={input} id="shellInput" aria-label="Command" value={line} disabled={!d || running}
              placeholder={!d ? "The NanoVNA is not connected." : running ? "Waiting for the NanoVNA…" : "Type a command. ? lists them."}
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              onChange={(e) => setLine(e.target.value)} onKeyDown={onKey} />
          </label>
        </div>
        {help && (
          <div id="shellHelp" aria-label="Commands">
            <p className="hint">Firmware differs. The NanoVNA answers <code>cmd?</code> to a command it does not know.</p>
            <ul>
              {SHELL_COMMANDS.map((c) => (
                <li key={c.name}>
                  <button type="button" disabled={!!c.refused} onClick={() => pick(c.name, c.args)}>
                    <code><b>{c.name}</b>{c.args && ` ${c.args}`}</code>
                    <span>{c.text}</span>
                    {c.refused && <span className="refused">Not sent here. {c.refused}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
