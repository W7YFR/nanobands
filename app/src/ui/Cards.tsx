/* The sidebar: one card per step. Load, Calibrate and Trace, Analyze, Export.
 * They show settings and send changes up; the state lives in App.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { MODES, type LicenseClass, type OperatingMode } from "@/bands";
import { fmtF } from "@/format";
import { calibrated, slotLabel } from "@/slots";
import type { Range } from "@/vna";
import type { Fine } from "@/fine";
import type { Doc, FineSpan, FreqCheck, Fields, GridNote, OcrNote, Prefs } from "./model";
import { Confirm } from "./Confirm";
import { Help } from "./Help";
import { ShellWindow, type ShellEntry } from "./ShellWindow";
import type { Vna } from "./useVna";

export type Mode = "idle" | "pen" | "ref";

const mhz = (hz: number): number => +(hz / 1e6).toFixed(6);
const rangeText = (r: Range): string => `${mhz(r.start)}–${mhz(r.stop)} MHz · ${r.points} points`;

/** The Shell window's state. It lives in the Load card, which stays while the
 *  page shows, so the window keeps its lines and stays open when the device
 *  panel goes, as when the NanoVNA disconnects. */
function useShell(vna: Vna): { show(): void; window: React.ReactNode } {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ShellEntry[]>([]);
  const history = useRef<string[]>([]);
  const show = (): void => { vna.setLive(false); setOpen(true); };
  const close = useCallback((): void => { setOpen(false); void vna.reread(); }, [vna]);
  return { show, window: open && <ShellWindow vna={vna} entries={entries} onEntries={setEntries} history={history.current} onClose={close} /> };
}

/** Two ways in: the NanoVNA and a file. Either one marks the step done: a
 *  connected NanoVNA keeps its panel in view, and an open file shrinks the
 *  card to its name. Change brings back the other way in, and Disconnect. */
/** A band the Fine row offers: its fine sweep, or why it has none, and whether it has one already. */
export interface FineChoice { band: string; fine: Fine | null; why: string | null; swept: boolean }

/** + Band: every band in the NanoVNA's range. One a fine sweep would not help is grayed, with the reason.
 *  All bands, at the top, sweeps each band that is not grayed. */
function FineMenu({ choices, onPick, onAll }: {
  choices: readonly FineChoice[]; onPick(c: FineChoice): void; onAll?: (() => void) | undefined;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent): void => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent): void => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className="fine-menu" ref={box}>
      <button id="fineAdd" type="button" className="add" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>+ Band</button>
      {open && (
        <div id="fineMenu" role="menu" aria-label="Fine sweep a band">
          <div className="hd">Fine sweep a band</div>
          {onAll && (() => {
            const n = choices.filter((c) => c.fine).length;
            return (
              <button id="fineAll" type="button" role="menuitem" disabled={n < 2}
                onClick={() => { setOpen(false); onAll(); }}>
                <span>All bands</span><small>{n < 2 ? "fewer than 2 bands" : `${n} bands`}</small>
              </button>
            );
          })()}
          {choices.map((c) => (
            <button key={c.band} type="button" role="menuitem" disabled={!c.fine}
              onClick={() => { setOpen(false); onPick(c); }}>
              <span>{c.band}</span><small>{c.why ?? (c.swept ? "swept · sweep again" : "")}</small>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function LoadCard({ source, fileName, over, onBrowse, vna, fine = [], onClearFine, choices = [], suggest = null, onFine, onFineAll }: {
  source: Doc["source"];
  fileName: string | null;
  over: boolean;
  onBrowse(): void;
  vna: Vna;
  /** The bands fine sweeps filled in. */
  fine?: readonly FineSpan[];
  /** ×: drop the fine sweeps and sweep the whole range. */
  onClearFine?(): void;
  /** The bands in the NanoVNA's range, for + Band. */
  choices?: readonly FineChoice[];
  /** The band the chart shows, when it can have a fine sweep and has none yet. */
  suggest?: FineChoice | null;
  /** Fine-sweep a band. Without it, as for a file, there is no Fine row. */
  onFine?: ((c: FineChoice) => void) | undefined;
  /** Fine-sweep every band that can have one. */
  onFineAll?: (() => void) | undefined;
}): React.ReactElement {
  const d = vna.device;
  const why = vna.unsupported || vna.note;
  // A sweep from the NanoVNA has a file name for its export, but no file was opened.
  const opened = source === "vna" ? null : fileName;
  const [changing, setChanging] = useState(false);
  // Read asks first when the device may hold a calibration no slot keeps.
  const [asking, setAsking] = useState(false);
  // A newly opened file, or a new connection, closes the choices again.
  useEffect(() => { setChanging(false); setAsking(false); }, [opened, d]);
  const read = (): void => { setAsking(false); void vna.readSlots(); };
  const cancelAsk = useCallback((): void => setAsking(false), []);
  const shell = useShell(vna);
  const p = vna.progress, focus = vna.focus;
  const on = (band: string | null): string => band ?? "full range";
  // A pass of more than one scan says where it is: the one loading indicator.
  const status = p ? (vna.live ? `Sweeping all live · ${on(p.band)}` : `Sweeping ${on(p.band)} · ${p.at} of ${p.of}`)
    : vna.live ? (focus === "all" ? "Sweeping all live" : focus ? `Sweeping ${focus.band} live` : "Sweeping live") : "Connected";

  const device = d ? (
    <div className={"panel" + (vna.live || p ? " live" : "")} id="vnaPanel">
      <div className="panel-head">
        <span className="status"><i />{status}</span>
        {/* Quiet on purpose: the shell is for those who know the NanoVNA's commands. */}
        {/* Under Change it hides but keeps its room, so the row keeps its height. */}
        <span className="panel-tools" style={changing ? { visibility: "hidden" } : undefined}>
          <button id="readSlots" className="quiet" disabled={vna.reading || vna.live || asking}
            title="Reads the range and calibration in each slot on the NanoVNA"
            onClick={() => (vna.slot === null ? setAsking(true) : read())}>{vna.reading ? "Reading…" : "Read"}</button>
          <button id="shellBtn" className="quiet" onClick={shell.show}>Shell</button>
        </span>
      </div>
      <p className="panel-sub" id="vnaInfo"><b>{d.info.board}</b> · firmware {d.info.version}</p>
      {/* Change shows only the ways out, so the settings step aside under it. */}
      {!changing && <>
      <div className="row">
        <label htmlFor="vnaSlot">Calibration</label>
        <select id="vnaSlot" value={vna.slot ?? ""} disabled={vna.reading} title="Loads a saved calibration on the NanoVNA, as its RECALL menu does"
          onChange={(e) => { if (e.target.value !== "") void vna.recall(+e.target.value); }}>
          {vna.slot === null && <option value="">As set</option>}
          {Array.from({ length: d.info.slots }, (_, i) => <option key={i} value={i}>{slotLabel(i, vna.slots?.[i])}</option>)}
        </select>
      </div>
      {/* Raw readings give a wrong SWR either way, so the warning stays until a calibration applies. */}
      {vna.cal && !calibrated(vna.cal) && (
        <p className="disclaimer vna-warn" id="vnaUncal">
          <b>No calibration applied.</b> The NanoVNA's readings are raw, so the SWR shown is wrong. Calibrate it, or load a slot that holds a calibration.
        </p>
      )}
      {asking && (
        <Confirm title="Read the slots?" action="Read slots" onConfirm={read} onCancel={cancelAsk}>
          <p>Reading loads each calibration slot on the NanoVNA in turn, then returns to the one it started on.</p>
          <p>The NanoVNA's current calibration does not match a known reading. If it is not saved on the device, reading the slots will cause the device to lose the current calibration.</p>
          <p>If it is already saved, you can ignore this message.</p>
        </Confirm>
      )}
      {vna.range && (
        <div className="row">
          <label>Range</label>
          <span id="vnaRange">{rangeText(vna.range)}</span>
        </div>
      )}
      {vna.range && onFine && (
        <div className="row fine">
          <label>Fine</label>
          {/* All, then every band with a fine sweep. Sweep and Live repeat
              the one pressed: All sweeps the whole range and each band, a
              band only itself. A click on another makes it the one, and
              sweeps it. Then the band the chart shows, and + Band for any other. */}
          <span id="vnaFine" role="group" aria-label="Fine sweeps">
            {fine.length > 0 && (
              <button id="fineEvery" type="button" aria-pressed={focus === "all"}
                title="Sweep and Live sweep the whole range and each fine band, and show them together."
                onClick={() => void vna.setAll()}>All</button>
            )}
            {fine.map((f) => (
              <button key={f.band} type="button" aria-pressed={!!focus && focus !== "all" && focus.band === f.band}
                title={`${mhz(f.lo * 1e6)}–${mhz(f.hi * 1e6)} MHz. Sweep and Live repeat the band that is pressed.`}
                onClick={() => void vna.setFine({ band: f.band, start: Math.round(f.lo * 1e6), stop: Math.round(f.hi * 1e6) })}>{f.band}</button>
            ))}
            {suggest && (
              <button id="fineSuggest" type="button" className="add" title={`Fine-sweeps ${suggest.band}, the band the chart shows`}
                onClick={() => onFine(suggest)}>+ {suggest.band}</button>
            )}
            <FineMenu choices={choices} onPick={onFine} onAll={onFineAll} />
          </span>
          {fine.length > 0 && (
            <button id="fineClear" className="quiet" title="Drops the fine sweeps and sweeps the whole range again" aria-label="Sweep the whole range"
              onClick={() => (onClearFine ? onClearFine() : void vna.setFine(null))}>×</button>
          )}
          <Help text="Sweeps one band with all the NanoVNA's points, for more detail than the whole range gives." />
        </div>
      )}
      <div className="panel-actions">
        <button id="sweepBtn" className="primary" disabled={vna.live || !!p} onClick={() => void vna.sweep()}>Sweep</button>
        <button id="liveBtn" className={vna.live ? "on" : ""} disabled={!!p && !vna.live} onClick={() => vna.setLive(!vna.live)}>{vna.live ? "Hold" : "Live"}</button>
      </div>      </>}
    </div>
  ) : (
    <div className="row">
      <button id="vnaBtn" className="wide" disabled={!!vna.unsupported} onClick={() => void vna.connect()}>Connect NanoVNA</button>
    </div>
  );
  const note = why && <p className="hint" id="vnaNote">{why}</p>;
  const disconnect = d && <div className="row"><button id="vnaBtn" className="wide" onClick={() => void vna.disconnect()}>Disconnect</button></div>;
  const drop = (
    <div className={"drop" + (over ? " over" : "")} id="drop" onClick={onBrowse}>
      Drop or paste a photo of the SWR screen<br />or a Touchstone <code>.s1p</code> file, or <u>browse…</u>
    </div>
  );
  const header = (done: boolean) => (
    <h2><b className={"step" + (done ? " done" : "")} /> Load
      {done && <><span style={{ flex: 1 }}></span>
        <button id="changeBtn" className="small" onClick={() => setChanging(!changing)}>{changing ? "Cancel" : "Change"}</button></>}
    </h2>
  );

  const openAnother = <div className="row"><button id="openAnother" className="wide" onClick={onBrowse}>Open another file</button></div>;

  // With the NanoVNA connected, or a file open, the step is done. A connected
  // NanoVNA keeps its panel in view, file or not; Change holds only the ways
  // out: Disconnect, and a file instead. With only a file open, the card
  // shrinks to its name, and Change offers another file or the NanoVNA.
  if (d || opened) {
    return (
      <div className="card" id="loadCard">
        {header(true)}
        {opened && <p className="loaded" id="fileName">{opened}</p>}
        {d && device}
        {d && note}
        {changing && (
          <div className="change">
            {d ? disconnect : openAnother}
            <div className="or">or</div>
            {d ? (opened ? openAnother : drop) : <>{device}{note}</>}
          </div>
        )}
        {shell.window}
      </div>
    );
  }
  return (
    <div className="card" id="loadCard">
      {header(false)}
      {device}
      {note}
      <div className="or">or</div>
      {drop}
      {shell.window}
    </div>
  );
}

/** One line of what the app found: ✓ when it worked, ! when it needs you, … while it works. */
function Stat({ ok, id, children }: { ok: boolean | null; id?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <p className={"stat" + (ok === true ? " ok" : ok === false ? " bad" : "")} id={id}>
      <span className="ic">{ok === true ? "✓" : ok === false ? "!" : "…"}</span><span>{children}</span>
    </p>
  );
}

/** A button that reads as part of a line of text. */
function TextButton({ id, onClick, children }: { id?: string; onClick(): void; children: React.ReactNode }): React.ReactElement {
  return <button type="button" className="text" id={id} onClick={onClick}>{children}</button>;
}

function GridStat({ note, straight, onStraight }: { note: GridNote; straight: boolean; onStraight(): void }): React.ReactElement {
  return note.kind === "found"
    ? <Stat ok id="gridNote">Grid found · <TextButton id="gridEdit" onClick={onStraight}>{straight ? "Edit corners" : "Straighten"}</TextButton></Stat>
    : <Stat ok={false} id="gridNote">No grid found. Drag the photo's corners onto it.</Stat>;
}

function OcrStat({ note, onUse }: { note: OcrNote; onUse(): void }): React.ReactElement {
  const f = (x: number): number => +x.toFixed(6);
  switch (note.kind) {
    case "looking": return <Stat ok={null} id="ocrNote">Reading the sweep from the photo</Stat>;
    case "read": return <Stat ok id="ocrNote">Sweep read from the photo: {f(note.start)}–{f(note.stop)} MHz{note.scale ? `, SWR ${f(note.scale.bot)}–${f(note.scale.top)}` : ""}</Stat>;
    case "offer": return <Stat ok={null} id="ocrNote">The photo says {f(note.start)}–{f(note.stop)} MHz. <TextButton id="ocrUse" onClick={onUse}>Use it</TextButton></Stat>;
    case "none": return <Stat ok={false} id="ocrNote">No sweep found on the photo. Enter it below.</Stat>;
    case "foreign": return <Stat ok={false} id="ocrNote">This doesn't look like a NanoVNA screen. Try another photo, or enter the sweep below.</Stat>;
    case "failed": return <Stat ok={false} id="ocrNote">Couldn't read the photo's text. Enter the sweep below.</Stat>;
  }
}

/** Whether the fields give a sweep the chart can use. */
const sweepSet = (f: Fields): boolean => {
  const a = parseFloat(f.start), b = parseFloat(f.stop);
  return Number.isFinite(a) && Number.isFinite(b) && b > a;
};

export function CalibrateCard({ fields, onField, grid, ocr, straight, onStraight, onUseOcr, onDetectGrid, mode, onRefMode, refs, onRemoveRef }: {
  fields: Fields;
  onField(k: keyof Fields, v: string): void;
  grid: GridNote | null;
  ocr: OcrNote | null;
  /** The photo is squared up on its corners; false while they are edited. */
  straight: boolean;
  onStraight(): void;
  onUseOcr(): void;
  onDetectGrid(): void;
  mode: Mode;
  onRefMode(): void;
  refs: readonly { u: number; f: number }[];
  onRemoveRef(j: number): void;
}): React.ReactElement {
  const num = (k: keyof Fields, id: string): React.ReactElement => (
    <input type="number" id={id} step="any" value={fields[k]} onChange={(e) => onField(k, e.target.value)} />
  );
  const done = sweepSet(fields);
  // Folded when the app finished the step itself: the grid found and the
  // sweep read. Typing never folds it, so it cannot close under the cursor.
  const auto = grid?.kind === "found" && ocr?.kind === "read";
  const [open, setOpen] = useState(!auto);
  useEffect(() => setOpen(!auto), [auto]);
  const shut = done && !open;
  return (
    <div className="card" id="calCard">
      <h2><b className={"step" + (done ? " done" : "")} /> Calibrate <span style={{ flex: 1 }}></span>
        {done && <button id="calToggle" className="small" onClick={() => setOpen(!open)}>{open ? "Done" : "Change"}</button>}
      </h2>
      {shut && <p className="loaded" id="calSummary">{fields.start}–{fields.stop} MHz · SWR {fields.bot}–{fields.top}</p>}
      <div hidden={shut}>
        {(grid || ocr) && (
          <div className="stats">
            {grid && <GridStat note={grid} straight={straight} onStraight={onStraight} />}
            {ocr && <OcrStat note={ocr} onUse={onUseOcr} />}
          </div>
        )}
        <div className="form">
          <label htmlFor="fStart">Start (MHz)</label>{num("start", "fStart")}<Help text="The frequency at the grid's left edge." />
          <label htmlFor="fStop">Stop (MHz)</label>{num("stop", "fStop")}<Help text="The frequency at the grid's right edge." />
          <label htmlFor="swrTop">Top SWR</label>{num("top", "swrTop")}<Help text="The SWR at the grid's top line." />
          <label htmlFor="swrBot">Bottom SWR</label>{num("bot", "swrBot")}<Help text="The SWR at the grid's bottom line." />
          <button id="gridBtn" className="span" onClick={onDetectGrid}>Detect grid</button>
          <Help text="Finds the grid again and squares the photo up on it." />
          <button id="refBtn" className={"span" + (mode === "ref" ? " on" : "")} onClick={onRefMode}>+ Frequency reference</button>
          <Help text="Click two points of known frequency on the photo to work out start and stop." />
        </div>
        {refs.length > 0 && (
          <div className="refs" id="refs">
            {refs.map((r, j) => <span key={j}>{r.f} MHz <i onClick={() => onRemoveRef(j)}>×</i></span>)}
            {refs.length === 1 && <> <span style={{ border: "none", background: "none" }}>add one more…</span></>}
          </div>
        )}
      </div>
    </div>
  );
}

export function TraceCard({ trace, mode, onAutoTrace, onPen, onErase, sens, onSens, retrace }: {
  /** How the photo's trace was made, or null with no trace. */
  trace: { auto: boolean; edited: boolean } | null;
  mode: Mode;
  onAutoTrace(): void;
  onPen(): void;
  onErase(): void;
  sens: string;
  onSens(v: string): void;
  retrace: boolean;
}): React.ReactElement {
  const done = !!trace && !retrace;
  // Folded when the auto-trace did the step, and opened when it needs you:
  // no trace, or moved corners. A pen fix leaves it as it is, so the photo
  // does not move under the pen.
  const auto = done && trace.auto && !trace.edited;
  const [open, setOpen] = useState(!auto);
  useEffect(() => { if (auto) setOpen(false); else if (!done) setOpen(true); }, [auto, done]);
  const shut = done && !open;
  const how = !trace ? "" : trace.auto ? (trace.edited ? "Traced automatically, then fixed with the pen" : "Traced automatically") : "Traced with the pen";
  return (
    <div className="card" id="traceCard">
      <h2><b className={"step" + (done ? " done" : "")} /> Trace <span style={{ flex: 1 }}></span>
        {done && <button id="traceToggle" className="small" onClick={() => setOpen(!open)}>{open ? "Done" : "Change"}</button>}
      </h2>
      {shut && <p className="loaded" id="traceSummary">{how}</p>}
      <div hidden={shut}>
        <div className="stats">
          {retrace
            ? <Stat ok={false} id="retraceHint">Corners moved. <TextButton onClick={onAutoTrace}>Auto-trace</TextButton> again to fit them.</Stat>
            : trace ? <Stat ok id="traceNote">{how}</Stat>
            : <Stat ok={false} id="traceNote">No trace yet. Auto-trace it, or draw it with the pen.</Stat>}
        </div>
        <div className="form">
          <button id="traceBtn" className={"span" + (trace ? "" : " primary")} onClick={onAutoTrace}>Auto-trace curve</button>
          <Help text="Finds the yellow curve on the photo and traces it." />
          <button id="penBtn" className={"span" + (mode === "pen" ? " on" : "")} onClick={onPen}>✎ Pen fix</button>
          <Help text="Drag along the curve on the photo to redraw that stretch." />
          <button id="clearBtn" className="span" disabled={!trace} onClick={onErase}>Erase trace</button>
          <Help text="Removes the trace, to draw it from scratch with the pen." />
          <label htmlFor="sens">Sensitivity</label>
          <input type="range" id="sens" min="20" max="140" value={sens} onChange={(e) => onSens(e.target.value)} />
          <Help text="Left picks up a fainter curve. Right ignores more of the background." />
        </div>
      </div>
    </div>
  );
}

/** The SWR at the checked frequency and whether you may transmit there. A
 *  missing SWR leaves the verdict to the band plan alone. */
function CheckResult({ c, sweep, thr, top, onView }: {
  c: FreqCheck;
  sweep: [number, number] | null;
  thr: number;
  top: number;
  onView(): void;
}): React.ReactElement {
  const known = !Number.isNaN(c.swr);
  // An SWR at the top of the scale may be any higher, so it never passes.
  const over = known && (c.swr > thr || c.clipped);
  const swrText = !sweep ? "No sweep loaded"
    : c.f < sweep[0] || c.f > sweep[1] ? `Outside the sweep (${fmtF(sweep[0])}–${fmtF(sweep[1])} MHz)`
    : !known ? "No reading here"
    : c.clipped ? `SWR ≥ ${top}, off the top of the scale`
    : `SWR ${c.swr.toFixed(2)}${over ? `, over Max SWR ${thr}` : ""}`;
  const planText = c.seg ? `${c.band!.name} · ${MODES[c.seg[2]].label}` : (c.band ? `${c.band.name} · ` : "") + c.why;
  const verdict = c.ok ? "ok" : c.why || over ? "no" : null;
  const inSweep = !!sweep && c.f >= sweep[0] && c.f <= sweep[1];
  return (
    <div className="stats check" id="freqCheck">
      {(verdict || inSweep) && (
        <p className="stat verdict">
          {verdict && <span className={"pill " + verdict}>{verdict === "ok" ? "You may transmit" : "Do not transmit"}</span>}
          {inSweep && <button id="freqView" className="small" onClick={onView}>View</button>}
        </p>
      )}
      <p className={"stat" + (known ? (over ? " bad" : " ok") : "")}><span className="ic">{known ? (over ? "✗" : "✓") : "–"}</span>{swrText}</p>
      <p className={"stat" + (c.seg ? " ok" : " bad")}><span className="ic">{c.seg ? "✓" : "✗"}</span>{planText}</p>
    </div>
  );
}

export const AnalyzeCard = memo(function AnalyzeCard({ prefs, onPref, onPin, onView, check, sweep, thr, top }: {
  prefs: Prefs;
  onPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void;
  /** Enter in Frequency: pin it to the chart. */
  onPin(): void;
  /** View: zoom the chart to the frequency. */
  onView(): void;
  check: FreqCheck | null;
  sweep: [number, number] | null;
  thr: number;
  top: number;
}): React.ReactElement {
  const freqIn = useRef<HTMLInputElement>(null);
  return (
    <div className="card">
      <h2><b className="step" /> Analyze</h2>
      <div className="form">
        <label htmlFor="thr">Max SWR</label>
        <input type="number" id="thr" step="0.1" value={prefs.thr} onChange={(e) => onPref("thr", e.target.value)} />
        <Help text="Frequencies at or under this SWR count as usable." />
        <label htmlFor="cls">License</label>
        <select id="cls" value={prefs.cls} onChange={(e) => onPref("cls", e.target.value as LicenseClass)}>
          <option value="E">Amateur Extra</option><option value="A">Advanced</option><option value="G">General</option><option value="T">Technician</option>
        </select>
        <Help text="Shows only the segments this class may use." />
        <label htmlFor="mode">Mode</label>
        <select id="mode" value={prefs.mode} onChange={(e) => onPref("mode", e.target.value as OperatingMode)}>
          <option value="any">Any mode</option><option value="phone">Phone (SSB/AM/FM)</option><option value="cw">CW</option><option value="data">RTTY / digital</option>
        </select>
        <Help text="Shows only the segments that allow this mode." />
        <label htmlFor="prom">Dip/peak min.</label>
        <input type="number" id="prom" step="0.05" value={prefs.prom} onChange={(e) => onPref("prom", e.target.value)} />
        <Help text="Smaller dips and peaks are not marked." />
        <label htmlFor="freq">Frequency</label>
        <span className="clearable">
          <input type="number" id="freq" ref={freqIn} step="0.001" min="0" placeholder="MHz" value={prefs.freq} onChange={(e) => onPref("freq", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onPin(); }} />
          {prefs.freq && <button type="button" className="clear" id="freqClear" aria-label="Clear frequency"
            onClick={() => { onPref("freq", ""); freqIn.current?.focus(); }}>
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1L7 7M7 1L1 7" /></svg>
          </button>}
        </span>
        <Help text="Marks this frequency in MHz on the chart and says whether you may transmit there; Enter, or a click on its mark, pins it." />
      </div>
      {check && <CheckResult c={check} sweep={sweep} thr={thr} top={top} onView={onView} />}
    </div>
  );
});

/** Files to save. A file that does not apply to what is loaded is left out;
 *  one with nothing to save yet is off. */
export function ExportCard({ onPhoto, onChart, onCsv, onS1p }: {
  onPhoto: (() => void) | null;
  onChart: (() => void) | null;
  onCsv: (() => void) | null;
  onS1p: (() => void) | null;
}): React.ReactElement {
  return (
    <div className="card" id="exportCard">
      <h2>Export</h2>
      <div className="stack">
        {onPhoto && <button id="expPhoto" onClick={onPhoto}>Photo with overlay (PNG)</button>}
        <button id="expChart" disabled={!onChart} onClick={onChart ?? undefined}>Chart (PNG)</button>
        <button id="expCsv" disabled={!onCsv} onClick={onCsv ?? undefined}>Data (CSV)</button>
        {onS1p && <button id="expS1p" onClick={onS1p}>Touchstone (.s1p)</button>}
      </div>
    </div>
  );
}
