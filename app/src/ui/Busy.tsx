/* A veil over the page while it waits on work it cannot show yet: a read of
 * the NanoVNA's slots, a sweep, a photo being opened. It holds the page
 * still and says what it waits on. It shows only after a moment, so quick
 * work does not flash it. */

import { createPortal } from "react-dom";

export function Busy({ text, detail }: {
  /** What the page waits on, such as `Sweeping`. */
  text: string;
  /** Where the work is, such as `40m · 2 of 5`. */
  detail?: string | null;
}): React.ReactElement {
  return createPortal(
    <div className="busy-back" id="busy">
      <div className="busy" role="status" aria-live="polite">
        <i aria-hidden="true" />
        <span>{text}…</span>
        {detail && <small>{detail}</small>}
      </div>
    </div>,
    document.body,
  );
}
