/* The matching network card: the coil and capacitor that would match the
 * latest sweep to the line at one frequency, the one the Smith chart's
 * readout gives.
 *
 * The card starts shut on every visit. The first Show in a browser asks you
 * to agree to the risks; the agreement holds until the terms change. Open,
 * the card shows the warning first, then each answer with a drawing of
 * where its parts go, then where to put the network. Each answer's "?" says
 * when to use it, with the calculations in a panel that opens. Each part
 * gives the voltage and current it sees at the power picked in the card.
 *
 * The network is for the latest sweep only, matched to the sweep's Z0. At a
 * frequency between two readings far apart, the impedance is only an
 * estimate, so the card shows no parts there.
 */

import { useState } from "react";
import { fmtF } from "@/format";
import { HIGH_A, HIGH_V, fmtPart, hardToBuild, matchAt, stressOf, type Answer, type Match, type Part, type Stress } from "@/match";
import { impedance, isEstimate, s11At } from "@/smith";
import { agreeMatch, matchAgreed } from "@/terms";
import { APP_VERSION } from "@/build-info";
import { Confirm } from "./Confirm";
import { Help } from "./Help";
import { swrOn, type Curve, type Power } from "./model";
import { Switch } from "./Switch";
import { fmtZ, readoutF, type SmithData } from "./SmithView";

/** A number for the calculations, with a true minus sign. */
const num = (n: number, d: number): string => (n < 0 ? "−" : "") + Math.abs(n).toFixed(d);
/** A susceptance in siemens, to three significant figures. */
const sie = (b: number): string => (b < 0 ? "−" : "") + +Math.abs(b).toPrecision(3);

const POWERS = [{ value: "5", label: "5 W" }, { value: "100", label: "100 W" }, { value: "1500", label: "1500 W" }] as const;

/** A voltage or current to three figures at most, as a builder reads it. */
const amt = (n: number): string => (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : String(Math.round(n)));

/** The voltage and current lines of answer `a` at `watts`, the part next to the load first. */
function stressLines(a: Answer, r: number, x: number, z0: number, watts: number): string {
  const s = stressOf(r, x, z0, a, watts), lines = [`P  = ${watts} W`];
  const peak = (v: number): string => `${amt(v / Math.SQRT2)} V, × √2 = ${amt(v)} V peak`;
  const series = (st: Stress, i: string): void => {
    lines.push(`V  = ${i} × |Xs| = ${amt(st.i)} × ${num(Math.abs(a.xs), 1)} = ${peak(st.v)}`);
  };
  const across = (st: Stress, v: string): void => {
    lines.push(`I  = ${v} × |B| = ${amt(st.v / Math.SQRT2)} × ${sie(Math.abs(a.b))} = ${amt(st.i)} A`);
  };
  if (a.loadSide === "series") {
    if (s.series) { lines.push(`IL = √(P ÷ R) = √(${watts} ÷ ${num(r, 1)}) = ${amt(s.series.i)} A`); series(s.series, "IL"); }
    if (s.across) { lines.push(`V0 = √(P × Z0) = √(${watts} × ${+z0.toFixed(1)}) = ${peak(s.across.v)}`); across(s.across, "V0"); }
  } else {
    if (s.across) { lines.push(`VL = √(P × (R² + X²) ÷ R) = ${peak(s.across.v)}`); across(s.across, "VL"); }
    if (s.series) { lines.push(`I0 = √(P ÷ Z0) = √(${watts} ÷ ${+z0.toFixed(1)}) = ${amt(s.series.i)} A`); series(s.series, "I0"); }
  }
  return lines.join("\n");
}

/** When to use answer `a`, by what its parts do. `noFilter`: no answer here is a filter. */
function whenText(a: Answer, one: boolean, noFilter: boolean): string {
  if (one) return "One part is enough here. The other part works out to almost nothing, so it is left out.";
  if (a.filter === "low") return "The coil in series and the capacitor across the line pass low frequencies and block higher ones. That also cuts your transmitter's harmonics, so this is usually the one to pick for transmitting.";
  // The coil to ground drains static off the antenna only when it is on the antenna side of the capacitor.
  if (a.filter === "high") return "The capacitor in series blocks DC. It passes higher frequencies, so it does not cut harmonics." +
    (a.loadSide === "across" ? " The coil to ground is on the antenna side, so it also drains static off the antenna." : "");
  return "This option is not a filter, so it does not cut harmonics." + (noFilter ? " Neither option is, so pick the one whose parts are easier to get or build." : "");
}

/** The line for one part, from its reactance or susceptance. */
function partLine(p: Part, series: boolean, xs: number, b: number): string {
  const v = fmtPart(p);
  if (series) return p.kind === "coil" ? `L  = Xs ÷ 2πf = ${v}` : `C  = 1 ÷ (2πf × ${num(-xs, 1)}) = ${v}`;
  return p.kind === "capacitor" ? `C  = B ÷ 2πf = ${v}` : `L  = 1 ÷ (2πf × ${sie(-b)}) = ${v}`;
}

/** The calculations for answer `a` of load R + jX on a z0 line. A part left out has no line of its own. */
function calcLines(a: Answer, r: number, x: number, z0: number, form: "series-first" | "across-first"): string {
  const m = a.sign < 0 ? "−" : "", pm = a.sign < 0 ? "−" : "+";
  const lines: string[] = [];
  if (form === "series-first") {
    lines.push(`Xs = ${m}√(R(Z0 − R)) − X`, `   = ${m}√(${num(r, 1)} × ${num(z0 - r, 1)}) ${x < 0 ? "+" : "−"} ${num(Math.abs(x), 1)} = ${num(a.xs, 1)} Ω`);
    if (a.series) lines.push(partLine(a.series, true, a.xs, a.b));
    lines.push(`B  = ${m}√((Z0 − R) ÷ R) ÷ Z0`, `   = ${m}√(${num(z0 - r, 1)} ÷ ${num(r, 1)}) ÷ ${num(z0, 0)} = ${sie(a.b)} S`);
    if (a.across) lines.push(partLine(a.across, false, a.xs, a.b));
    return lines.join("\n");
  } else {
    lines.push(`B  = (X ${pm} √(R ÷ Z0) · √(R² + X² − Z0·R)) ÷ (R² + X²)`, `   = ${sie(a.b)} S`);
    if (a.across) lines.push(partLine(a.across, false, a.xs, a.b));
    lines.push("Xs = 1 ÷ B + X·Z0 ÷ R − Z0 ÷ (B·R)", `   = ${num(a.xs, 1)} Ω`);
  }
  if (a.series) lines.push(partLine(a.series, true, a.xs, a.b));
  return lines.join("\n");
}

/** A small drawing of where an answer's parts go: the radio at left, the way to the antenna at right. */
function Diagram({ a }: { a: Answer }): React.ReactElement {
  const top = 18, bot = 60;
  // The part next to the load sits near the antenna; the other on the radio side.
  const sx = a.loadSide === "series" ? 150 : 70, ax = a.loadSide === "series" ? 80 : 190;
  const coilH = (x: number): string => `M${x} ${top} q4 -8 8 0 q4 -8 8 0 q4 -8 8 0 q4 -8 8 0`;
  const capH = (x: number): string => `M${x} ${top} h13 M${x + 13} ${top - 9} v18 M${x + 19} ${top - 9} v18 M${x + 19} ${top} h13`;
  const coilV = (x: number): string => `M${x} ${top + 6} q8 4 0 8 q8 4 0 8 q8 4 0 8 q8 4 0 8`;
  const capV = (x: number): string => `M${x} ${top + 6} v13 M${x - 9} ${top + 19} h18 M${x - 9} ${top + 25} h18 M${x} ${top + 25} v13`;
  const wire = a.series ? `M34 ${top} H${sx} M${sx + 32} ${top} H218` : `M34 ${top} H218`;
  return (
    <svg className="matchDiagram" viewBox="0 0 282 74" aria-hidden="true">
      <text x="4" y={top + 4} className="lbl">Radio</text>
      <path d={wire} className="wire" />
      <path d={`M34 ${bot} H218`} className="wire gnd" />
      {a.series && <path d={a.series.kind === "coil" ? coilH(sx) : capH(sx)} className="part" />}
      {a.series && <text x={sx + 16} y={top + 26} textAnchor="middle" className="val" data-part="series">{fmtPart(a.series)}</text>}
      {a.across && <path d={`M${ax} ${top} v6 M${ax} ${top + 38} V${bot}`} className="wire" />}
      {a.across && <path d={a.across.kind === "coil" ? coilV(ax) : capV(ax)} className="part" />}
      {a.across && <text x={ax + 14} y={top + 26} className="val" data-part="across">{fmtPart(a.across)}</text>}
      <text x="222" y={top + 4} className="lbl">To antenna</text>
    </svg>
  );
}

/** One answer's lines: each part, where it goes, and what it sees at `watts`. */
function PartRows({ a, st, watts }: { a: Answer; st: ReturnType<typeof stressOf>; watts: number }): React.ReactElement {
  const side = (s: "series" | "across"): string => (a.loadSide === s ? "on the antenna side" : "on the radio side");
  const row = (p: Part, s: "series" | "across"): React.ReactElement => {
    const v = st[s]!;
    return (
      <li data-part={s}><b>{fmtPart(p)}</b> {p.kind} <span className="w">{s === "series" ? "in series" : "across the line"}, {side(s)}{hardToBuild(p) ? " · hard to build" : ""}</span>
        <span className="vi">{amt(v.v)} V peak, {amt(v.i)} A RMS at {watts} W{v.v > HIGH_V && <b> · high voltage</b>}{v.i > HIGH_A && <b> · high current</b>}</span>
      </li>
    );
  };
  return <ul>{a.series && row(a.series, "series")}{a.across && row(a.across, "across")}</ul>;
}

export function MatchCard({ data, curve, range, manual, hoverF, power, onPower }: {
  data: SmithData;
  curve: Curve | null;
  range: [number, number];
  manual: readonly number[];
  hoverF: number | null;
  power: Power;
  onPower(p: Power): void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [ticked, setTicked] = useState(false);
  const g = data.latest, z0 = g.z0;
  const { f, what } = readoutF(g, curve, range, manual, hoverF);
  const at = f !== null ? s11At(g, f) : null;
  const z = at ? impedance(at[0], at[1], z0) : null;
  const swr = f !== null ? swrOn(curve, f) : NaN;
  const m: Match | null = f !== null && z && !Number.isNaN(swr) ? matchAt(z[0], z[1], z0, f, swr) : null;
  const est = f !== null && isEstimate(g, f);
  // A stored power from an older or edited setting falls back to the default.
  const pw: Power = POWERS.some((p) => p.value === power) ? power : "100", watts = +pw;
  const stress = z && m?.kind === "parts" ? m.answers.map((a) => stressOf(z[0], z[1], z0, a, watts)) : [];
  const each = stress.flatMap((s) => [s.series, s.across]).filter((s): s is Stress => !!s);
  const hiV = each.some((s) => s.v > HIGH_V), hiA = each.some((s) => s.i > HIGH_A);
  const show = (): void => {
    if (matchAgreed()) setOpen(true);
    else { setTicked(false); setAsking(true); }
  };

  return (
    <div className={"card" + (open ? "" : " collapsed")} id="matchCard">
      <h2>Matching network {!open && f !== null && <span className="sub">· {fmtF(f)} MHz</span>}
        <span style={{ flex: 1 }}></span>
        <button id="matchToggle" className="small" onClick={() => (open ? setOpen(false) : show())}>{open ? "Hide" : "Show"}</button>
      </h2>
      {open && (
        <div id="matchBody">
          <div className="disclaimer">
            <span className="line"><b>Check before you transmit.</b> These values are for ideal parts at one frequency. Real parts differ, so measure again with the NanoVNA after you build.</span>
            <span className="line"><b>Build at your own risk!</b> Use parts rated for your power. The parts can carry high voltage and current, more so when the impedance is high.</span>
          </div>
          {f === null || !z ? (
            <p className="matchMsg">Point at a line on the Smith chart, or pin a frequency, to work out a network there.</p>
          ) : (
            <>
              <p className="matchAt"><b>{fmtF(f)} MHz</b> <span>{what && `· ${what} `}· Latest sweep · {est && "≈ "}{fmtZ(z)} · SWR {swr.toFixed(2)} · to {+z0.toFixed(1)} Ω</span></p>
              {est && m?.kind === "parts" && <p className="matchMsg">This frequency falls between two readings that are far apart, so the impedance here is only an estimate. Point at a reading, or sweep finer, to work out a network.</p>}
              {m?.kind === "none" && <p className="matchMsg">No network needed. The SWR here is already under 1.10.</p>}
              {m?.kind === "unsure" && <p className="matchMsg">NanoBands could not work out a network it can check here. Try a reading next to this one.</p>}
              {m?.kind === "extreme" && <p className="matchMsg">Almost all of the signal reflects back here. A network to match it would need parts too extreme to build, and real parts would lose most of the power.</p>}
              {m?.kind === "parts" && !est && (
                <>
                  <div className="matchPow"><span>Voltage and current at</span>
                    <Switch id="matchPower" label="Power for the voltage and current" value={pw} options={POWERS} onChange={onPower} />
                  </div>
                  <div className="matchAns">
                    {m.answers.map((a, i) => {
                      const one = !a.series || !a.across, noFilter = m.answers.every((x) => !x.filter);
                      const name = m.answers.length === 1 ? (one ? "One part" : "The network") : `Option ${i + 1}`;
                      const kind = a.filter === "low" ? "Low-pass, also cuts harmonics" : a.filter === "high" ? "High-pass" : "";
                      return (
                        <div className="matchOpt" key={i}>
                          <div className="name"><b>{name}</b>{kind && <span className="kind"> · {kind}</span>}
                            <Help interactive align="start" label={`About ${m.answers.length === 1 ? "this network" : `option ${i + 1}`}`} text={
                              <span className="matchTip">
                                <span className="h">When to use it</span>
                                <span className="p">{whenText(a, one, noFilter)}</span>
                                <details>
                                  <summary>Calculations</summary>
                                  <span className="p">At {fmtF(f)} MHz the NanoVNA measured R = {num(z[0], 1)} Ω and X = {num(z[1], 1)} Ω, on a Z0 = {+z0.toFixed(1)} Ω line. {m.form === "series-first"
                                    ? "R is under Z0, so the part in series goes on the antenna side."
                                    : "R is over Z0, so the part across the line goes on the antenna side."} Xs is the reactance of the part in series. B is the susceptance of the part across the line.{one ? " One of them works out to almost nothing, so its part is left out." : ""}</span>
                                  <pre>{calcLines(a, z[0], z[1], z0, m.form)}</pre>
                                  <span className="p">With ideal parts, {m.answers.length > 1 ? "either option turns" : "this network turns"} {fmtZ(z)} into {+z0.toFixed(1)} + j0 Ω{one ? ", or within an SWR of 1.01 with the tiny part left out" : " exactly"}.{m.answers.length > 1 ? " Option 2 takes the minus sign before the square root." : ""}</span>
                                  <span className="p">For the voltage and current, P is the power going into the network. With ideal parts, all of P reaches the load's R. The part on the antenna side sees the load's voltage or current. The part on the radio side sees the line's. The peak voltage is √2 times the RMS voltage.</span>
                                  <pre>{stressLines(a, z[0], z[1], z0, watts)}</pre>
                                </details>
                              </span>
                            } />
                          </div>
                          <Diagram a={a} />
                          <PartRows a={a} st={stress[i]!} watts={watts} />
                        </div>
                      );
                    })}
                  </div>
                  {hiV && <p className="matchNote warn">A part marked high voltage sees over {HIGH_V} V peak. Most small mica and ceramic capacitors are rated {HIGH_V} V or less.</p>}
                  {hiA && <p className="matchNote warn">A part marked high current carries over {HIGH_A} A. Thin wire and small toroids get hot.</p>}
                  <p className="matchNote">The voltage is the peak voltage across each part. A capacitor needs a voltage rating above it. The current is the RMS current through each part. The RMS current is what heats a part. These numbers are for the finished network at {fmtF(f)} MHz. While you tune the network, or at other frequencies, the parts can see more.</p>
                  <p className="matchNote">These parts match {fmtF(f)} MHz only. The SWR elsewhere in the band will differ. Put them where the NanoVNA was connected. If you measured at the radio end of the coax, they go between the radio and the coax, like a tuner.</p>
                </>
              )}
            </>
          )}
        </div>
      )}
      {asking && (
        <Confirm title="Before you build a matching network" action="Agree and show" disabled={!ticked}
          onCancel={() => setAsking(false)}
          onConfirm={() => { agreeMatch(APP_VERSION); setAsking(false); setOpen(true); }}>
          <p>NanoBands works out these parts from your measurement, for ideal parts at one frequency. They are a starting point, not a tested design.</p>
          <ul className="matchRisks">
            <li><b>Real parts differ.</b> Measure again with the NanoVNA after you build, before you transmit.</li>
            <li><b>A bad match can damage your transmitter.</b></li>
            <li><b>The parts can carry high voltage and current.</b> RF can burn you. Use parts rated for your power.</li>
            <li><b>Put the parts where the NanoVNA was connected.</b> Parts worked out for one point do not work at another.</li>
          </ul>
          <label className="matchAgree"><input type="checkbox" id="matchAgree" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
            <span>I understand these risks. I build and transmit at my own risk, and NanoBands and its author are not liable for any damage or injury, as the <a href="terms.html" target="_blank" rel="noreferrer">terms of use</a> say.</span>
          </label>
        </Confirm>
      )}
    </div>
  );
}
