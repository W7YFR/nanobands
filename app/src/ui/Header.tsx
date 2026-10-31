/* The page header: the callsign home, the name, the line under it, and Clear.
 *
 * On the landing the name and its line are hidden: the landing shows them
 * large instead. `nameRef` and `subRef` are for the flight between the two.
 */

import type { Ref } from "react";
import { CALLSIGN_ART, NAME_ART, SUBTITLE } from "./wordmarks";

export function Header({ nameRef, subRef, onClear }: {
  nameRef: Ref<HTMLSpanElement>;
  subRef: Ref<HTMLSpanElement>;
  /** Null hides Clear. It keeps its room, so the header does not change height. */
  onClear: (() => void) | null;
}): React.ReactElement {
  return (
    <header>
      <a className="callsign" href="https://www.w7yfr.com" aria-label="W7YFR — back to w7yfr.com">
        <span className="art" aria-hidden="true">{CALLSIGN_ART}</span>
      </a>
      <span className="div" />
      <h1><span className="art" role="img" aria-label="NanoBands" ref={nameRef}>{NAME_ART}</span></h1>
      <span className="sub" ref={subRef}>{SUBTITLE}</span>
      <button id="clearAll" className={onClear ? "" : "ghost"} title="Clear the file and start over"
        disabled={!onClear} aria-hidden={!onClear} onClick={onClear ?? undefined}>Clear</button>
    </header>
  );
}
