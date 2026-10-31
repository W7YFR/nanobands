/* The sidebar: one card per step. Load, Calibrate and Trace, Analyze, Export.
 * They show settings and send changes up; the state lives in App.
 */

import { memo } from "react";
import type { LicenseClass, OperatingMode } from "@/bands";
import type { Range } from "@/vna";
import type { Doc, Fields, GridNote, OcrNote, Prefs } from "./model";
import { Help } from "./Help";
import type { Vna } from "./useVna";

export type Mode = "idle" | "pen" | "ref";

const mhz = (hz: number): number => +(hz / 1e6).toFixed(6);
const rangeText = (r: Range): string => `${mhz(r.start)}–${mhz(r.stop)} MHz · ${r.points} points`;

/** Two ways in: the NanoVNA on top, in its own panel, then a file. */
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
  return (
    <div className="card">
      <h2><b className="step" /> Load</h2>
      {d ? (
        <div className={"vna" + (vna.live ? " live" : "")} id="vnaPanel">
          <div className="vna-head">
            <span className="status"><i />{vna.live ? "Sweeping live" : "Connected"}</span>
            <button id="vnaBtn" className="quiet" onClick={() => void vna.disconnect()}>Disconnect</button>
          </div>
          <p className="vna-board" id="vnaInfo"><b>{d.info.board}</b> · firmware {d.info.version}</p>
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
          <div className="vna-actions">
            <button id="sweepBtn" className="primary" disabled={vna.live} onClick={() => void vna.sweep()}>Sweep</button>
            <button id="liveBtn" className={vna.live ? "on" : ""} onClick={() => vna.setLive(!vna.live)}>{vna.live ? "Hold" : "Live"}</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button id="vnaBtn" className="wide" disabled={!!vna.unsupported} onClick={() => void vna.connect()}>Connect NanoVNA</button>
        </div>
      )}
      {why && <p className="hint" id="vnaNote">{why}</p>}
      <div className="or">or</div>
      <div className={"drop" + (over ? " over" : "")} id="drop" onClick={onBrowse}>
        {opened
          ? <><b className="fname">{opened}</b><br /><u>choose another…</u></>
          : <>Drop or paste a photo of the SWR screen<br />or a Touchstone <code>.s1p</code> file, or <u>browse…</u></>}
      </div>
      {source === "image" && <p className="hint">An .s1p export (NanoVNA-Saver, or the NanoVNA's own SD-card save) skips calibration and tracing and gives exact data.</p>}
    </div>
  );
}

function GridText({ note }: { note: GridNote }): React.ReactElement {
  return note.kind === "found"
    ? <>✓ Grid found ({note.horizontal} horizontal, {note.vertical} vertical lines). Photo straightened; <b>Edit corners</b> to adjust.</>
    : <>Couldn't find the grid automatically, so drag the corners into place.</>;
}

function OcrText({ note, onUse }: { note: OcrNote; onUse(): void }): React.ReactElement {
  const f = (x: number): number => +x.toFixed(6);
  switch (note.kind) {
    case "looking": return <>Looking for START/STOP text in the photo…</>;
    case "read": return <>✓ Read from photo: <b>{f(note.start)}–{f(note.stop)} MHz</b>. Check it against the screen (OCR saw “{note.raw}”).</>;
    case "offer": return <>Photo says {f(note.start)}–{f(note.stop)} MHz. <a href="#" id="ocrUse" onClick={(e) => { e.preventDefault(); onUse(); }}>Use it</a></>;
    case "none": return <>No START/STOP text found in the photo, so enter the sweep below.</>;
    case "failed": return <>Couldn't run text recognition (offline?), so enter the sweep below.</>;
  }
}

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
  const num = (k: keyof Fields, id: string, placeholder?: string): React.ReactElement => (
    <input type="number" id={id} step="any" placeholder={placeholder} value={fields[k]} onChange={(e) => onField(k, e.target.value)} />
  );
  return (
    <div className="card" id="calCard">
      <h2><b className="step" /> Calibrate</h2>
      <p className="hint" style={{ marginTop: 0 }}>When a photo loads, the plot grid is found and the photo is squared up on it. If it looks off, <b>Edit corners</b> (above the photo) shows the 4 yellow-ringed handles; drag them onto the grid's corners (a magnifier appears while dragging), then <b>Straighten</b> again.</p>
      {grid && <p className="hint" id="gridNote"><GridText note={grid} /></p>}
      {ocr && <p className="hint" id="ocrNote"><OcrText note={ocr} onUse={onUseOcr} /></p>}
      <div className="row"><label>Sweep start</label>{num("start", "fStart", "MHz")} MHz</div>
      <div className="row"><label>Sweep stop</label>{num("stop", "fStop", "MHz")} MHz</div>
      <div className="row"><label>SWR at top</label>{num("top", "swrTop")}</div>
      <div className="row"><label>SWR at bottom</label>{num("bot", "swrBot")}</div>
      <div className="row">
        <button id="gridBtn" onClick={onDetectGrid}>Detect grid</button>
        <button id="refBtn" className={mode === "ref" ? "on" : ""} onClick={onRefMode}>+ Frequency reference</button>
      </div>
      <div className="refs" id="refs">
        {refs.map((r, j) => <span key={j}>{r.f} MHz <i onClick={() => onRemoveRef(j)}>×</i></span>)}
        {refs.length === 1 && <> <span style={{ border: "none", background: "none" }}>add one more…</span></>}
      </div>
      <p className="hint">Don't know start/stop? Click a point whose frequency you know (a marker, or a VNA grid line), enter the MHz, and repeat once more. Start/stop are solved from the two.</p>
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
        <span />
        <label htmlFor="cls">License</label>
        <select id="cls" value={prefs.cls} onChange={(e) => onPref("cls", e.target.value as LicenseClass)}>
          <option value="E">Amateur Extra</option><option value="A">Advanced</option><option value="G">General</option><option value="T">Technician</option>
        </select>
        <span />
        <label htmlFor="mode">Mode</label>
        <select id="mode" value={prefs.mode} onChange={(e) => onPref("mode", e.target.value as OperatingMode)}>
          <option value="any">Any mode</option><option value="phone">Phone (SSB/AM/FM)</option><option value="cw">CW</option><option value="data">RTTY / digital</option>
        </select>
        <Help text="CW is legal anywhere you have privileges. The CW/data sub-bands (blue) are the parts where phone isn't allowed." />
        <label htmlFor="prom">Dip/peak min.</label>
        <input type="number" id="prom" step="0.05" value={prefs.prom} onChange={(e) => onPref("prom", e.target.value)} />
        <Help text="Dips and peaks smaller than this many SWR are ignored." />
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
