/* What a first visit sees: the name, what the app does, and the two ways in.
 * Nothing here needs data.
 */

import type { Ref } from "react";
import { NAME_ART, SUBTITLE } from "./wordmarks";

export function Landing({ heroRef, onConnect, unsupported, note, onOpen }: {
  heroRef: Ref<HTMLDivElement>;
  onConnect(): void;
  /** Why Connect cannot work in this browser, or "". */
  unsupported: string;
  /** The last connection error, or "". */
  note: string;
  onOpen(): void;
}): React.ReactElement {
  const why = unsupported || note;
  return (
    <section id="landing">
      <div className="art" id="hero" role="img" aria-label="NanoBands" ref={heroRef}>{NAME_ART}</div>
      <p className="lead">{SUBTITLE}</p>
      <div className="ways">
        <button id="landConnect" className="primary" disabled={!!unsupported} onClick={onConnect}>Connect NanoVNA</button>
        {why && <p className="hint" id="landNote">{why}</p>}
        <div className="or">or</div>
        <button id="landOpen" onClick={onOpen}>Open a photo or .s1p file</button>
        <p className="hint">A photo of the NanoVNA's SWR screen, or a Touchstone file. You can also drop or paste one anywhere on the page.</p>
      </div>
    </section>
  );
}
