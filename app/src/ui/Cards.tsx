/* The sidebar: one card per step. Load, Calibrate and Trace, Analyze, Export.
 * They show settings and send changes up; the state lives in App.
 */

import { memo, useEffect, useState } from "react";
import type { LicenseClass, OperatingMode } from "@/bands";
import type { Range } from "@/vna";
import type { Doc, Fields, GridNote, OcrNote, Prefs } from "./model";
import { Help } from "./Help";
import type { Vna } from "./useVna";

export type Mode = "idle" | "pen" | "ref";

const mhz = (hz: number): number => +(hz / 1e6).toFixed(6);
const rangeText = (r: Range): string => `${mhz(r.start)}–${mhz(r.stop)} MHz · ${r.points} points`;

/** Two ways in: the NanoVNA and a file. A connected NanoVNA shows its panel,
 *  with a file drop under it. An open file marks the step done. */
export function LoadCard({ source, fileName, over, onBrowse, vna }: {
  source: Doc["source"];
  fileName: string | null;
  over: boolean;
  onBrowse(): void;
  vna: Vna;
}): React.ReactElement {
  const d = vna.device;
  const why = vna.unsupported || vna.note;
  // A sweep from the NanoVNA has a file name for its export, but no file was opened.
  const opened = source === "vna" ? null : fileName;
  const [changing, setChanging] = useState(false);
  // A newly opened file closes the choices again.
  useEffect(() => setChanging(false), [opened]);

  const device = d ? (
    <div className={"panel" + (vna.live ? " live" : "")} id="vnaPanel">
      <div className="panel-head">
        <span className="status"><i />{vna.live ? "Sweeping live" : "Connected"}</span>
        <button id="vnaBtn" className="quiet" onClick={() => void vna.disconnect()}>Disconnect</button>
      </div>
      <p className="panel-sub" id="vnaInfo"><b>{d.info.board}</b> · firmware {d.info.version}</p>
      <div className="row">
        <label htmlFor="vnaSlot">Calibration</label>
        <select id="vnaSlot" defaultValue="" title="Loads a saved calibration on the NanoVNA, as its RECALL menu does"
          onChange={(e) => { if (e.target.value !== "") void vna.recall(+e.target.value); }}>
          <option value="">As set</option>
          {Array.from({ length: d.info.slots }, (_, i) => <option key={i} value={i}>Slot {i}</option>)}
        </select>
      </div>
      {vna.range && (
        <div className="row">
          <label>Range</label>
          <span id="vnaRange">{rangeText(vna.range)}</span>
        </div>
      )}
      <div className="panel-actions">
        <button id="sweepBtn" className="primary" disabled={vna.live} onClick={() => void vna.sweep()}>Sweep</button>
        <button id="liveBtn" className={vna.live ? "on" : ""} onClick={() => vna.setLive(!vna.live)}>{vna.live ? "Hold" : "Live"}</button>
      </div>
    </div>
  ) : (
    <div className="row">
      <button id="vnaBtn" className="wide" disabled={!!vna.unsupported} onClick={() => void vna.connect()}>Connect NanoVNA</button>
    </div>
  );
  const note = why && <p className="hint" id="vnaNote">{why}</p>;

  const choices = (
    <>
      <div className="row"><button id="openAnother" className="wide" onClick={onBrowse}>Open another file</button></div>
      <div className="or">or</div>
      {device}
      {note}
    </>
  );

  // With a file open, the step is done: the card shrinks to its name and
  // Change, which brings back both ways in.
  if (opened) {
    return (
      <div className="card" id="loadCard">
        <h2><b className="step done" /> Load <span style={{ flex: 1 }}></span>
          <button id="changeBtn" className="small" onClick={() => setChanging(!changing)}>{changing ? "Cancel" : "Change"}</button>
        </h2>
        <p className="loaded" id="fileName">{opened}</p>
        {changing && <div className="change">{choices}</div>}
      </div>
    );
  }
  return (
    <div className="card" id="loadCard">
      <h2><b className="step" /> Load</h2>
      {device}
      {note}
      <div className="or">or</div>
      <div className={"drop" + (over ? " over" : "")} id="drop" onClick={onBrowse}>
        Drop or paste a photo of the SWR screen<br />or a Touchstone <code>.s1p</code> file, or <u>browse…</u>
      </div>
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

function GridStat({ note }: { note: GridNote }): React.ReactElement {
  return note.kind === "found"
    ? <Stat ok id="gridNote">Grid found <Help align="start" text="If it is off, Edit corners on the photo lets you move its corners." /></Stat>
    : <Stat ok={false} id="gridNote">No grid found. Drag the photo's corners onto it.</Stat>;
}

function OcrStat({ note, onUse }: { note: OcrNote; onUse(): void }): React.ReactElement {
  const f = (x: number): number => +x.toFixed(6);
  switch (note.kind) {
    case "looking": return <Stat ok={null} id="ocrNote">Reading the sweep from the photo</Stat>;
    case "read": return <Stat ok id="ocrNote">Sweep read from the photo: {f(note.start)}–{f(note.stop)} MHz</Stat>;
    case "offer": return <Stat ok={null} id="ocrNote">The photo says {f(note.start)}–{f(note.stop)} MHz. <a href="#" id="ocrUse" onClick={(e) => { e.preventDefault(); onUse(); }}>Use it</a></Stat>;
    case "none": return <Stat ok={false} id="ocrNote">No sweep found on the photo. Enter it below.</Stat>;
    case "failed": return <Stat ok={false} id="ocrNote">Couldn't read the photo's text. Enter the sweep below.</Stat>;
  }
}

/** Whether the fields give a sweep the chart can use. */
const sweepSet = (f: Fields): boolean => {
  const a = parseFloat(f.start), b = parseFloat(f.stop);
  return Number.isFinite(a) && Number.isFinite(b) && b > a;
};

export function CalibrateCard({ fields, onField, grid, ocr, onUseOcr, onDetectGrid, mode, onRefMode, refs, onRemoveRef }: {
  fields: Fields;
  onField(k: keyof Fields, v: string): void;
  grid: GridNote | null;
  ocr: OcrNote | null;
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
            {grid && <GridStat note={grid} />}
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

export function TraceCard({ traced, mode, onAutoTrace, onPen, onErase, sens, onSens, retrace }: {
  traced: boolean;
  mode: Mode;
  onAutoTrace(): void;
  onPen(): void;
  onErase(): void;
  sens: string;
  onSens(v: string): void;
  retrace: boolean;
}): React.ReactElement {
  return (
    <div className="card" id="traceCard">
      <h2><b className="step" /> Trace</h2>
      <div className="row">
        <button id="traceBtn" className={traced ? "" : "primary"} onClick={onAutoTrace}>Auto-trace curve</button>
        <button id="penBtn" className={mode === "pen" ? "on" : ""} onClick={onPen}>✎ Pen fix</button>
        <button id="clearBtn" onClick={onErase}>Erase trace</button>
      </div>
      <div className="row"><label>Color sensitivity</label><input type="range" id="sens" min="20" max="140" value={sens} onChange={(e) => onSens(e.target.value)} /></div>
      <p className="hint">Auto-trace follows the yellow line and ignores on-screen text. If it strays, turn on Pen fix and drag along the real curve to redraw that stretch. (You can also trace by hand from scratch with the pen.)</p>
      {retrace && <p className="warn" id="retraceHint">Corners moved — click Auto-trace again to re-fit.</p>}
    </div>
  );
}

export const AnalyzeCard = memo(function AnalyzeCard({ prefs, onPref }: {
  prefs: Prefs;
  onPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void;
}): React.ReactElement {
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
      </div>
    </div>
  );
});

export function ExportCard({ onPhoto, onChart, onCsv, onS1p }: {
  onPhoto: (() => void) | null;
  onChart(): void;
  onCsv(): void;
  onS1p: (() => void) | null;
}): React.ReactElement {
  return (
    <div className="card">
      <h2>Export</h2>
      <div className="row">
        {onPhoto && <button id="expPhoto" onClick={onPhoto}>Photo + overlay PNG</button>}
        <button id="expChart" onClick={onChart}>Chart PNG</button>
        <button id="expCsv" onClick={onCsv}>CSV</button>
        {onS1p && <button id="expS1p" onClick={onS1p}>Touchstone .s1p</button>}
      </div>
    </div>
  );
}
