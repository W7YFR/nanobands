/* The page. It holds what is loaded and the settings it is read with, works
 * out the curve and its analysis, and hands both to the cards that show them.
 *
 * Nothing loaded and no NanoVNA connected shows the landing. Anything else
 * shows the page: the steps down the side, the photo, the chart and the
 * tables. The last file and the work done on it are saved, so a refresh
 * picks up where it left off.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Band } from "@/bands";
import { mappingFor, solveRefs, type Quad } from "@/geometry";
import { detectGrid } from "@/grid";
import { fixedWords } from "@/ocr-zeros";
import { ocrCanvas, recognize } from "@/ocr";
import { axisLabels, DIVISIONS, fitScale, parsePerDivision, type SwrScale } from "@/scale-text";
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
  DEFAULT_FIELDS, DEFAULT_PREFS, EMPTY_DOC, analysisOf, bandView, checkAt, curveOf, defaultCorners, loadImage, photoFrom, pickBand, rectOf, settingsOf, swrOn, viewAround, viewOf,
  type Doc, type Fields, type Photo, type Picked, type Prefs, type Trace,
} from "./model";
import { PhotoCard } from "./PhotoCard";
import { applySnapshot, snapshotOf, type Snapshot } from "./session";
import { Switch } from "./Switch";
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
/** Resolves once the browser has painted what React last rendered. */
const nextPaint = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));

function traced(d: Doc): Doc {
  if (!d.photo || !d.corners) return d;
  const { N, v } = autoTrace(d.photo.px, mappingFor(d.corners).fwd, d.corners, +d.fields.sens);
  return { ...d, trace: { kind: "photo", N, v, auto: true, edited: false }, retrace: false };
}

/** A doc with the sweep read off the photo filled in, and the SWR scale when
 *  that was read too. */
function withSweep(d: Doc, r: { start: number; stop: number; raw: string; scale?: SwrScale | undefined }): Doc {
  return {
    ...d, fields: { ...d.fields, start: String(+r.start.toFixed(6)), stop: String(+r.stop.toFixed(6)) },
    view: null, sweepTyped: false, ocr: { kind: "read", start: r.start, stop: r.stop, raw: r.raw, ...(r.scale ? { scale: r.scale } : {}) },
  };
}

/** A doc with the SWR scale read off the photo, unless the user typed one.
 *  The axis labels give both ends. Without them, the header's SWR per
 *  division gives the top from the bottom in the field. */
function withScale(d: Doc, sc: SwrScale | null, per: number | null): Doc {
  if (d.fields.top !== DEFAULT_FIELDS.top || d.fields.bot !== DEFAULT_FIELDS.bot) return d;
  if (sc) return { ...d, fields: { ...d.fields, top: String(sc.top), bot: String(sc.bot) } };
  if (per) return { ...d, fields: { ...d.fields, top: String(+(+d.fields.bot + DIVISIONS * per).toFixed(4)) } };
  return d;
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
  /** The chart's view while the pointer is over a band's rows in Band segments. */
  const [peek, setPeek] = useState<[number, number] | null>(null);
  /** The band a click in Band segments put on the chart, and the view before it. */
  const picked = useRef<Picked | null>(null);
  /** The name of a photo being opened, while its grid and trace are worked out. */
  const [opening, setOpening] = useState<string | null>(null);
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
  const check = useMemo(() => {
    const f = parseFloat(prefs.freq);
    return f > 0 ? checkAt(curve, settings, f) : null;
  }, [curve, settings, prefs.freq]);
  /** Enter pinned the typed frequency, so the chart no longer marks it. A new
   *  frequency marks again. */
  const [probePinned, setProbePinned] = useState(false);
  useEffect(() => setProbePinned(false), [prefs.freq]);
  const probe = check && !probePinned && !doc.manual.includes(check.f) ? check.f : null;
  const sweep = useMemo((): [number, number] | null => (an ? [an.fmin, an.fmax] : null), [an]);

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
      const words = fixedWords(data, photo.px, scale);
      const text = data.lines?.length ? words.map((l) => l.map((w) => w.text).join(" ")).join("\n") : data.text;
      const r = parseSweepText(text), per = parsePerDivision(text);
      setDoc((was) => {
        if (was.photo !== photo) return was;
        const labels = was.corners ? axisLabels(words.flat(), mappingFor(was.corners).back) : [];
        const d = withScale(was, fitScale(labels, per), per), scaleRead = d !== was ? { top: +d.fields.top, bot: +d.fields.bot } : undefined;
        if (!r) return { ...d, ocr: { kind: "none" } };
        return d.sweepTyped ? { ...d, ocr: { kind: "offer", start: r.start, stop: r.stop, raw: r.raw } } : withSweep(d, { ...r, scale: scaleRead });
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
    if (isTouchstone(name)) { void file.text().then((t) => showTouchstone(t, name, "s1p", false)); return; }
    // Opening a photo holds the page for a moment. Show the page and a
    // placeholder for the photo first, then do the work.
    setOpening(name);
    void nextPaint()
      .then(() => openPhoto(file, name))
      .catch(() => alert("Couldn't read that image."))
      .finally(() => setOpening(null));
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

  // Edit corners and Straighten. It works on the photo, so it opens the photo if it was collapsed.
  const onStraight = (): void => setDoc((d) => ({ ...d, straight: !d.straight, collapsed: false }));

  const setCollapsed = (c: boolean): void => {
    setDoc((d) => ({ ...d, collapsed: c }));
    if (c) { setMode("idle"); setHoverF(null); }
  };
  // Both work on the photo, so they bring it back if it was collapsed.
  const toggleMode = (m: Mode): void => {
    if (doc.collapsed) setCollapsed(false);
    setMode((cur) => (cur === m ? "idle" : m));
  };

  /** A corner drag ended: the new corners, and the trace again for them. */
  const onCorners = (q: Quad): void =>
    setDoc((d) => {
      const n: Doc = { ...d, corners: q };
      return n.trace?.kind !== "photo" ? n : n.trace.auto && !n.trace.edited ? traced(n) : { ...n, retrace: true };
    });

  const penLast = useRef<[number, number] | null>(null);
  /** Each pen stroke: the trace before it, and the trace it left. */
  const strokes = useRef<{ before: Trace | null; after: Trace | null }[]>([]);
  const [, setStrokeCount] = useState(0);
  /** A pen stroke reached (x, y) in view pixels. `erase` wipes the trace along it instead of drawing. */
  const onPen = (x: number, y: number, start: boolean, erase = false): void => {
    const d = docRef.current;
    if (!view || d.source !== "image") return;
    if (start) {
      penLast.current = null;
      strokes.current.push({ before: d.trace, after: d.trace });
      setStrokeCount(strokes.current.length);
    }
    if (erase && d.trace?.kind !== "photo") return;
    const t = d.trace?.kind === "photo" ? d.trace : { kind: "photo" as const, N: 1200, v: new Float32Array(1200).fill(NaN), auto: false, edited: true };
    const [u, v0] = view.vb(x, y), v = Math.max(0, Math.min(1, v0)), i = Math.floor(u * t.N);
    if (i < 0 || i >= t.N) { penLast.current = null; return; }
    const tv = t.v.slice();
    const last = penLast.current;
    if (last) {
      const [i0, w0] = last, a = Math.min(i0, i), b = Math.max(i0, i);
      for (let j = a; j <= b; j++) tv[j] = erase ? NaN : i === i0 ? v : w0 + ((v - w0) * (j - i0)) / (i - i0);
    } else tv[i] = erase ? NaN : v;
    penLast.current = [i, v];
    const next: Trace = { ...t, v: tv, edited: true };
    const top = strokes.current.at(-1);
    if (top) top.after = next;
    setDoc((cur) => ({ ...cur, trace: next }));
  };
  // Undo takes back the last stroke only while the trace is still the one it
  // left: an auto-trace or an erase since then makes the strokes moot.
  const lastStroke = strokes.current.at(-1);
  const canUndo = !!lastStroke && lastStroke.after === doc.trace;
  // Every pen mark gone: an auto-trace is traced again, a hand-drawn one erased.
  const canClear = doc.trace?.kind === "photo" && doc.trace.edited;
  const onClearMarks = (): void => {
    strokes.current = [];
    setStrokeCount(0);
    setDoc((d) => (d.trace?.kind !== "photo" ? d : d.trace.auto ? traced(d) : { ...d, trace: null }));
  };
  const onUndo = (): void => {
    const top = strokes.current.pop();
    if (top && top.after === docRef.current.trace) setDoc((d) => ({ ...d, trace: top.before }));
    else strokes.current = [];
    setStrokeCount(strokes.current.length);
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

  const onTogglePin = (f: number, tol: number): void => {
    if (f === probe) setProbePinned(true);
    setDoc((d) => {
      const hit = d.manual.findIndex((m) => Math.abs(m - f) < tol);
      if (hit >= 0) return { ...d, manual: d.manual.filter((_, j) => j !== hit) };
      return Number.isNaN(swrOn(curve, f)) ? d : { ...d, manual: [...d.manual, f] };
    });
  };

  const onPinFreq = useCallback((): void => {
    const f = parseFloat(prefs.freq);
    if (!(f > 0) || Number.isNaN(swrOn(curve, f))) return;
    setDoc((d) => (d.manual.includes(f) ? d : { ...d, manual: [...d.manual, f] }));
    setProbePinned(true);
  }, [prefs.freq, curve]);

  const onViewFreq = useCallback((): void => {
    const f = parseFloat(prefs.freq);
    if (!an || !(f > 0)) return;
    setDoc((d) => ({ ...d, view: viewAround(an, f) }));
    chartRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [prefs.freq, an]);

  const onPeekBand = useCallback((b: Band | null): void => setPeek(b && an ? bandView(an, b) : null), [an]);
  const onPickBand = useCallback((b: Band): void => {
    if (!an) return;
    const r = pickBand(doc.view, picked.current, bandView(an, b));
    picked.current = r.picked;
    // The pick shows at once. The hover shows again when the pointer comes back.
    setPeek(null);
    setDoc((d) => ({ ...d, view: r.view }));
  }, [an, doc.view]);

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

  const landing = !doc.source && !vna.device && !opening;
  let resNote = "";
  if (an && curve) {
    const res = ((an.fmax - an.fmin) / curve.N) * 1000;
    resNote = doc.source === "image"
      ? `Traced resolution ≈ ${res < 10 ? res.toFixed(1) : Math.round(res)} kHz per point`
      : `${curve.N} points from ${doc.source === "vna" ? "the NanoVNA" : "file"}`;
  }

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
                  <CalibrateCard fields={doc.fields} onField={onField} grid={doc.grid} ocr={doc.ocr} straight={doc.straight} onStraight={onStraight}
                    onUseOcr={() => setDoc((d) => (d.ocr?.kind === "offer" ? withSweep(d, d.ocr) : d))}
                    onDetectGrid={onDetectGrid} mode={mode} onRefMode={() => toggleMode("ref")}
                    refs={doc.refs} onRemoveRef={(j) => setDoc((d) => withRefs(d, d.refs.filter((_, i) => i !== j)))} />
                  <TraceCard trace={doc.trace?.kind === "photo" ? doc.trace : null} mode={mode} onAutoTrace={() => setDoc(traced)} onPen={() => toggleMode("pen")}
                    onErase={() => setDoc((d) => ({ ...d, trace: null }))} sens={doc.fields.sens} onSens={onSens} retrace={doc.retrace} />
                </>
              )}
              <AnalyzeCard prefs={prefs} onPref={onPref} onPin={onPinFreq} onView={onViewFreq} check={check} sweep={sweep} thr={settings.thr} top={settings.top} />
              <ExportCard onPhoto={photoScene ? exportPhoto : null} onChart={an ? exportChart : null} onCsv={an ? exportCsv : null} onS1p={exportS1p} />
            </aside>
            <main>
              {opening ? (
                <div className="card" id="opening">
                  <h2>Photo</h2>
                  <p className="empty">Opening {opening}…</p>
                </div>
              ) : photoScene && (
                <PhotoCard scene={photoScene} kRef={kRef} collapsed={doc.collapsed} onCollapse={() => setCollapsed(!doc.collapsed)}
                  onStraight={onStraight} mode={mode} onPenMode={() => toggleMode("pen")} onUndo={onUndo} canUndo={canUndo} onClearMarks={onClearMarks} canClear={canClear}
                  onCorners={onCorners} onPen={onPen} onRef={onRef} onHover={setHoverF} />
              )}
              <ChartCard canvasRef={chartRef} an={an} curve={curve} settings={settings} view={peek ?? doc.view} onView={(v) => setDoc((d) => ({ ...d, view: v }))}
                manual={doc.manual} probe={probe} onTogglePin={onTogglePin} hoverF={hoverF} onHover={setHoverF} resNote={resNote} />
              <div className="card" id="bandCard">
                <h2>Band segments
                  <span style={{ flex: 1 }}></span>
                  <Switch id="bandsShown" label="Bands shown" value={prefs.bands} onChange={(v) => onPref("bands", v)}
                    options={[{ value: "all", label: "All" }, { value: "usable", label: "Usable" }]} />
                </h2>
                <div id="bandTable"><BandTable an={an} settings={settings} shown={prefs.bands} view={doc.view} onPeek={onPeekBand} onPick={onPickBand} /></div>
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
