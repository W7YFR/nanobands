/* The page. It holds what is loaded and the settings it is read with, works
 * out the curve and its analysis, and hands both to the cards that show them.
 *
 * Nothing loaded and no NanoVNA connected shows the landing. Anything else
 * shows the page: the steps down the side, the photo, the chart and the
 * tables. The last file and the work done on it are saved, so a refresh
 * picks up where it left off.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { mappingFor, solveRefs, type Point, type Quad } from "@/geometry";
import { detectGrid } from "@/grid";
import { fixSlashedZeros } from "@/ocr-zeros";
import { ocrCanvas, recognize } from "@/ocr";
import { openStore } from "@/store";
import { parseSweepText } from "@/sweep-text";
import { isTouchstone, parseTouchstone } from "@/touchstone";
import { autoTrace } from "@/trace";
import { toTouchstone } from "@/vna";
import { AnalyzeCard, CalibrateCard, ExportCard, LoadCard, TraceCard, type Mode } from "./Cards";
import { ChartCard } from "./ChartCard";
import { drawChart } from "./draw-chart";
import { drawPhoto } from "./draw-photo";
import { Flight } from "./Flight";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Landing } from "./Landing";
import {
  DEFAULT_FIELDS, DEFAULT_PREFS, EMPTY_DOC, analysisOf, curveOf, defaultCorners, loadImage, photoFrom, rectOf, settingsOf, swrOn, viewOf,
  type Doc, type Fields, type Photo, type Prefs,
} from "./model";
import { PhotoCard } from "./PhotoCard";
import { applySnapshot, snapshotOf, type Snapshot } from "./session";
import { BandTable, PointsTable } from "./Tables";
import { useFileDrop } from "./useFileDrop";
import { useVna } from "./useVna";

const PREFS_KEY = "swrfit";

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS; // storage blocked: defaults stand
  }
}

function download(name: string, url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

const mhz = (hz: number): number => +(hz / 1e6).toFixed(6);

/** A photo traced afresh from its corners. */
function traced(d: Doc): Doc {
  if (!d.photo || !d.corners) return d;
  const { N, v } = autoTrace(d.photo.px, mappingFor(d.corners).fwd, d.corners, +d.fields.sens);
  return { ...d, trace: { kind: "photo", N, v, auto: true, edited: false }, retrace: false };
}

/** A doc with the sweep read off the photo filled in. */
function withSweep(d: Doc, r: { start: number; stop: number; raw: string }): Doc {
  return {
    ...d, fields: { ...d.fields, start: String(+r.start.toFixed(6)), stop: String(+r.stop.toFixed(6)) },
    view: null, sweepTyped: false, ocr: { kind: "read", start: r.start, stop: r.stop, raw: r.raw },
  };
}

/** The sweep solved from the frequency references, when there are two. */
function withRefs(d: Doc, refs: Doc["refs"]): Doc {
  const r = solveRefs(refs);
  return { ...d, refs, fields: r ? { ...d.fields, start: String(+r.start.toFixed(4)), stop: String(+r.stop.toFixed(4)) } : d.fields };
}

export function App(): React.ReactElement {
  const [doc, setDoc] = useState<Doc>(EMPTY_DOC);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [mode, setMode] = useState<Mode>("idle");
  const [hoverF, setHoverF] = useState<number | null>(null);
  // Until the saved session is read back, show neither the landing nor the page.
  const [booting, setBooting] = useState(true);
  const store = useMemo(() => openStore(), []);
  const docRef = useRef(doc), bootingRef = useRef(booting);
  useLayoutEffect(() => { docRef.current = doc; bootingRef.current = booting; });
  const ocrJob = useRef(0), sensTimer = useRef<ReturnType<typeof setTimeout>>(undefined), kRef = useRef(1);
  const chartRef = useRef<HTMLCanvasElement>(null), fileIn = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLDivElement>(null), nameRef = useRef<HTMLSpanElement>(null), subRef = useRef<HTMLSpanElement>(null);

  /* ---------------- What the page shows ---------------- */

  const settings = useMemo(() => settingsOf(doc.fields, prefs), [doc.fields, prefs]);
  const curve = useMemo(() => curveOf(doc.trace, settings), [doc.trace, settings]);
  const an = useMemo(() => analysisOf(curve, settings), [curve, settings]);
  const map = useMemo(() => (doc.corners ? mappingFor(doc.corners) : null), [doc.corners]);
  const rect = useMemo(() => (doc.straight && doc.photo && doc.corners ? rectOf(doc.photo, doc.corners) : null), [doc.photo, doc.straight, doc.corners]);
  const view = useMemo(() => (doc.photo ? viewOf(doc.photo, map, rect) : null), [doc.photo, map, rect]);
  const swr = useCallback((f: number) => swrOn(curve, f), [curve]);

  /* ---------------- Loading ---------------- */

  const saveFile = useCallback((blob: Blob, name: string): void => {
    void store.del("session");
    void store.set("file", { blob, name });
  }, [store]);

  /** Show Touchstone data. A repeat sweep of the same range keeps the pins and the zoom. */
  const showTouchstone = useCallback((text: string, name: string, source: "s1p" | "vna", repeat: boolean): void => {
    const { f, s } = parseTouchstone(text);
    if (f.length < 2) { alert("Couldn't find S11 data in that file."); return; }
    setDoc((d) => ({
      ...(repeat ? d : EMPTY_DOC),
      source, fileName: name, s1p: { text, name }, photo: null, corners: null, straight: false, refs: [], grid: null, ocr: null,
      trace: { kind: "data", N: f.length, f: Float64Array.from(f), s: Float64Array.from(s) },
      fields: { ...(repeat ? d.fields : DEFAULT_FIELDS), start: String(+f[0]!.toFixed(4)), stop: String(+f[f.length - 1]!.toFixed(4)) },
    }));
    setMode("idle");
  }, []);

  /** Read START and STOP off the photo. A newer photo makes the reading moot. */
  const readSweep = useCallback(async (photo: Photo, job: number): Promise<void> => {
    try {
      const { canvas, scale } = ocrCanvas(photo.src);
      const data = await recognize(canvas);
      if (job !== ocrJob.current) return;
      const r = parseSweepText(fixSlashedZeros(data, photo.px, scale));
      setDoc((d) => {
        if (d.photo !== photo) return d;
        if (!r) return { ...d, ocr: { kind: "none" } };
        return d.sweepTyped ? { ...d, ocr: { kind: "offer", start: r.start, stop: r.stop, raw: r.raw } } : withSweep(d, r);
      });
    } catch {
      if (job === ocrJob.current) setDoc((d) => (d.photo === photo ? { ...d, ocr: { kind: "failed" } } : d));
    }
  }, []);

  /** Open a photo: find its grid, straighten it, trace it, read its sweep.
   *  A saved session is laid over it instead. */
  const openPhoto = useCallback(async (blob: Blob, name: string, saved?: Partial<Snapshot> | null): Promise<void> => {
    const photo = photoFrom(await loadImage(blob));
    const job = ++ocrJob.current;
    let d: Doc = { ...EMPTY_DOC, source: "image", fileName: name, photo, corners: defaultCorners(photo.w, photo.h) };
    setMode("idle");
    if (saved) { setDoc(applySnapshot(d, saved, traced)); return; }
    const g = detectGrid(photo.px);
    d = g
      ? traced({ ...d, corners: g.corners, straight: true, grid: { kind: "found", horizontal: g.horizontal, vertical: g.vertical } })
      : { ...d, grid: { kind: "missing" } };
    setDoc({ ...d, ocr: { kind: "looking" } });
    void readSweep(photo, job);
  }, [readSweep]);

  const handleFile = useCallback((file: File): void => {
    const name = file.name || "pasted image";
    // A new file starts a new session: keep the file, forget what was done to the last one.
    saveFile(file, name);
    if (isTouchstone(name)) void file.text().then((t) => showTouchstone(t, name, "s1p", false));
    else openPhoto(file, name).catch(() => alert("Couldn't read that image."));
  }, [saveFile, showTouchstone, openPhoto]);

  const over = useFileDrop(handleFile);

  /* ---------------- The NanoVNA ---------------- */

  const vna = useVna((scan, board, r) => {
    const name = `nanovna-${mhz(r.start)}-${mhz(r.stop)}mhz.s1p`, text = toTouchstone(scan, board);
    const d = docRef.current, repeat = d.source === "vna" && d.s1p?.name === name;
    const blob = new Blob([text], { type: "text/plain" });
    if (repeat) void store.set("file", { blob, name });
    else saveFile(blob, name);
    showTouchstone(text, name, "vna", repeat);
  });

  /* ---------------- The saved session ---------------- */

  const clear = (): void => {
    ocrJob.current++; // a reading still in flight lands nowhere
    vna.setLive(false);
    setDoc(EMPTY_DOC);
    setMode("idle");
    setHoverF(null);
    void store.del("file");
    void store.del("session");
    if (fileIn.current) fileIn.current.value = "";
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const f = await store.get<{ blob: Blob; name: string }>("file");
        if (!f || !live) return;
        const sv = await store.get<Snapshot>("session");
        if (isTouchstone(f.name)) {
          showTouchstone(await f.blob.text(), f.name, "s1p", false);
          if (sv) setDoc((d) => applySnapshot(d, sv, traced));
        } else await openPhoto(f.blob, f.name, sv ?? null);
      } catch {
        setDoc(EMPTY_DOC);
      } finally {
        if (live) setBooting(false);
      }
    })();
    return () => { live = false; };
  }, [store, showTouchstone, openPhoto]);

  useEffect(() => {
    if (booting || !doc.source) return;
    const t = setTimeout(() => void store.set("session", snapshotOf(doc)), 400);
    return () => clearTimeout(t);
  }, [doc, booting, store]);

  useEffect(() => {
    const save = (): void => { if (docRef.current.source && !bootingRef.current) void store.set("session", snapshotOf(docRef.current)); };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [store]);

  // Preferences outlive a file: they survive Clear and apply to the next one.
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage blocked: not remembered */ }
  }, [prefs]);

  /* ---------------- Editing ---------------- */

  const onField = (k: keyof Fields, v: string): void =>
    setDoc((d) => ({ ...d, fields: { ...d.fields, [k]: v }, ...(k === "start" || k === "stop" ? { view: null, sweepTyped: true } : {}) }));

  const onSens = (v: string): void => {
    onField("sens", v);
    clearTimeout(sensTimer.current);
    sensTimer.current = setTimeout(() => setDoc((d) => (d.trace?.kind === "photo" && d.trace.auto && !d.trace.edited ? traced(d) : d)), 150);
  };

  const onDetectGrid = (): void => {
    const photo = docRef.current.photo;
    if (!photo) return;
    const g = detectGrid(photo.px);
    setDoc((d) => {
      if (!g) return { ...d, grid: { kind: "missing" } };
      const n: Doc = { ...d, corners: g.corners, grid: { kind: "found", horizontal: g.horizontal, vertical: g.vertical } };
      const t = n.trace;
      return !t || (t.kind === "photo" && t.auto && !t.edited) ? traced(n) : { ...n, retrace: true };
    });
  };

  const setCollapsed = (c: boolean): void => {
    setDoc((d) => ({ ...d, collapsed: c }));
    if (c) { setMode("idle"); setHoverF(null); }
  };
  // Both work on the photo, so they bring it back if it was collapsed.
  const toggleMode = (m: Mode): void => {
    if (doc.collapsed) setCollapsed(false);
    setMode((cur) => (cur === m ? "idle" : m));
  };

  const onCornerMove = (j: number, p: Point): void =>
    setDoc((d) => {
      if (!d.corners) return d;
      const c = [...d.corners] as Quad;
      c[j] = p;
      return { ...d, corners: c };
    });
  const onCornerDrop = (): void =>
    setDoc((d) => (d.trace?.kind !== "photo" ? d : d.trace.auto && !d.trace.edited ? traced(d) : { ...d, retrace: true }));

  const penLast = useRef<[number, number] | null>(null);
  const onPen = (x: number, y: number, start: boolean): void => {
    const d = docRef.current;
    if (!view || d.source !== "image") return;
    if (start) penLast.current = null;
    const t = d.trace?.kind === "photo" ? d.trace : { kind: "photo" as const, N: 1200, v: new Float32Array(1200).fill(NaN), auto: false, edited: true };
    const [u, v0] = view.vb(x, y), v = Math.max(0, Math.min(1, v0)), i = Math.floor(u * t.N);
    if (i < 0 || i >= t.N) { penLast.current = null; return; }
    const tv = t.v.slice();
    const last = penLast.current;
    if (last) {
      const [i0, w0] = last, a = Math.min(i0, i), b = Math.max(i0, i);
      for (let j = a; j <= b; j++) tv[j] = i === i0 ? v : w0 + ((v - w0) * (j - i0)) / (i - i0);
    } else tv[i] = v;
    penLast.current = [i, v];
    setDoc((cur) => ({ ...cur, trace: { ...t, v: tv, edited: true } }));
  };

  const onRef = (x: number, y: number): void => {
    if (!view) return;
    const [u] = view.vb(x, y);
    const f = parseFloat(prompt("Frequency at this point (MHz):") ?? "");
    setMode("idle");
    if (Number.isFinite(f)) setDoc((d) => withRefs(d, [...d.refs, { u, f }]));
  };

  const onPref = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]): void => setPrefs((p) => ({ ...p, [k]: v })), []);
  const onRemovePin = useCallback((f: number): void => setDoc((d) => ({ ...d, manual: d.manual.filter((m) => m !== f) })), []);

  const onTogglePin = (f: number, tol: number): void =>
    setDoc((d) => {
      const hit = d.manual.findIndex((m) => Math.abs(m - f) < tol);
      if (hit >= 0) return { ...d, manual: d.manual.filter((_, j) => j !== hit) };
      return Number.isNaN(swrOn(curve, f)) ? d : { ...d, manual: [...d.manual, f] };
    });

  /* ---------------- Exports ---------------- */

  const photoScene = view && doc.corners
    ? { view, corners: doc.corners, settings, an, trace: doc.trace, curve, refs: doc.refs, manual: doc.manual, hoverF }
    : null;

  const exportPhoto = (): void => {
    if (!photoScene) return;
    const c = document.createElement("canvas");
    c.width = photoScene.view.w;
    c.height = photoScene.view.h;
    drawPhoto(c.getContext("2d")!, 1 / kRef.current, { ...photoScene, dragCorner: -1 }, true);
    download("swr-overlay.png", c.toDataURL("image/png"));
  };
  const exportChart = (): void => {
    const cv = chartRef.current;
    if (!cv) return;
    const W = cv.clientWidth, H = cv.clientHeight, c = document.createElement("canvas");
    c.width = W * 2;
    c.height = H * 2;
    drawChart(c.getContext("2d")!, W, H, 2, { settings, an, curve, range: an ? doc.view ?? [an.fmin, an.fmax] : null, manual: doc.manual, hoverF: null, drag: null });
    download("swr-chart.png", c.toDataURL("image/png"));
  };
  const exportCsv = (): void => {
    if (!curve) return;
    let csv = "freq_mhz,swr\n";
    for (let i = 0; i < curve.N; i++) if (!Number.isNaN(curve.s[i]) && !Number.isNaN(curve.f[i])) csv += `${curve.f[i]!.toFixed(6)},${curve.s[i]!.toFixed(3)}\n`;
    download("swr-trace.csv", URL.createObjectURL(new Blob([csv], { type: "text/csv" })));
  };
  const s1p = doc.s1p;
  const exportS1p = s1p ? (): void => download(s1p.name, URL.createObjectURL(new Blob([s1p.text], { type: "text/plain" }))) : null;

  /* ---------------- Layout ---------------- */

  const landing = !doc.source && !vna.device;
  let resNote = "";
  if (an && curve) {
    const res = ((an.fmax - an.fmin) / curve.N) * 1000;
    resNote = doc.source === "image"
      ? `· traced resolution ≈ ${res < 10 ? res.toFixed(1) : Math.round(res)} kHz per point`
      : `· ${curve.N} points from ${doc.source === "vna" ? "the NanoVNA" : "file"}`;
  }
  const traceIsPhoto = doc.trace?.kind === "photo";

  return (
    <div className={"app" + (booting ? " booting" : "") + (landing ? " no-data" : "")}>
      <Flight landing={landing} hero={heroRef} name={nameRef} sub={subRef}>
        <Header nameRef={nameRef} subRef={subRef} onClear={doc.source ? clear : null} />
        <input type="file" id="file" ref={fileIn} accept="image/*,.s1p,.s2p,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {landing ? (
          <Landing heroRef={heroRef} onConnect={() => void vna.connect()} unsupported={vna.unsupported} note={vna.note} onOpen={() => fileIn.current?.click()} />
        ) : (
          <div className="wrap">
            <aside>
              <LoadCard source={doc.source} fileName={doc.fileName} over={over} onBrowse={() => fileIn.current?.click()} vna={vna} />
              {doc.source === "image" && (
                <>
                  <CalibrateCard fields={doc.fields} onField={onField} grid={doc.grid} ocr={doc.ocr}
                    onUseOcr={() => setDoc((d) => (d.ocr?.kind === "offer" ? withSweep(d, d.ocr) : d))}
                    onDetectGrid={onDetectGrid} mode={mode} onRefMode={() => toggleMode("ref")}
                    refs={doc.refs} onRemoveRef={(j) => setDoc((d) => withRefs(d, d.refs.filter((_, i) => i !== j)))} />
                  <TraceCard traced={traceIsPhoto} mode={mode} onAutoTrace={() => setDoc(traced)} onPen={() => toggleMode("pen")}
                    onErase={() => setDoc((d) => ({ ...d, trace: null }))} sens={doc.fields.sens} onSens={onSens} retrace={doc.retrace} />
                </>
              )}
              <AnalyzeCard prefs={prefs} onPref={onPref} />
              <ExportCard onPhoto={photoScene ? exportPhoto : null} onChart={exportChart} onCsv={exportCsv} onS1p={exportS1p} />
            </aside>
            <main>
              {photoScene && (
                <PhotoCard scene={photoScene} kRef={kRef} collapsed={doc.collapsed} onCollapse={() => setCollapsed(!doc.collapsed)}
                  onStraight={() => setDoc((d) => ({ ...d, straight: !d.straight }))} mode={mode}
                  onCornerMove={onCornerMove} onCornerDrop={onCornerDrop} onPen={onPen} onRef={onRef} onHover={setHoverF} />
              )}
              <ChartCard canvasRef={chartRef} an={an} curve={curve} settings={settings} view={doc.view} onView={(v) => setDoc((d) => ({ ...d, view: v }))}
                manual={doc.manual} onTogglePin={onTogglePin} hoverF={hoverF} onHover={setHoverF} resNote={resNote} />
              <div className="card">
                <h2>Band segments you can use</h2>
                <div id="bandTable"><BandTable an={an} settings={settings} /></div>
                <p className="hint">US privileges per 47 CFR §97.301/305, checked against the ARRL frequency-allocations chart. 60 m is four 2.8 kHz channels plus the 5351.5–5366.5 kHz segment (USB/CW/data). Power limits and new rule changes aren't modeled, so check the current ARRL chart before you transmit.</p>
              </div>
              <div className={"card" + (prefs.points ? "" : " collapsed")} id="ptCard">
                <h2>Key points <span id="ptCount">{an ? `· ${an.crossings.length + an.extrema.length + doc.manual.length}` : ""}</span>
                  <span style={{ flex: 1 }}></span>
                  <button id="ptToggle" className="small" onClick={() => onPref("points", !prefs.points)}>{prefs.points ? "Collapse" : "Expand"}</button>
                </h2>
                <div id="ptTable" hidden={!prefs.points}>
                  <PointsTable an={an} settings={settings} manual={doc.manual} swr={swr}
                    onRemove={onRemovePin} />
                </div>
              </div>
            </main>
          </div>
        )}
        <Footer />
      </Flight>
      {over && <div id="dropping" aria-hidden="true"><p>Drop a photo or .s1p file to open it</p></div>}
    </div>
  );
}
