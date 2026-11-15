/* The warning that a result is not a promise. The page shows it at the top
 * while anything is open: a photo's reading is best effort, and a sweep's
 * readings are only as good as the NanoVNA's calibration. Terms, at its
 * right, opens the terms of use. With `onClose`, × beside it asks to close
 * the warning.
 */

import type { Doc } from "./model";

export function Disclaimer({ source, id, onClose }: { source: NonNullable<Doc["source"]>; id?: string; onClose?(): void }): React.ReactElement {
  return (
    <div className="disclaimer page" id={id}>
      <p className="lines">
        <span className="line"><b>Check before you transmit.</b> {
          source === "image"
            ? "Reading a photo is best effort, so confirm each result on your NanoVNA."
            : "Readings come from your NanoVNA as it is calibrated, so confirm each result on the device."
        }</span>
        <span className="line"><b>Transmit at your own risk!</b> NanoBands and its author are not responsible for damages to your system.</span>
      </p>
      <a className="terms" href="terms.html">Terms</a>
      {onClose && (
        <button type="button" className="close" id="termsClose" aria-label="Close" onClick={onClose}>
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1L7 7M7 1L1 7" /></svg>
        </button>
      )}
    </div>
  );
}
