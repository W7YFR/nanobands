/* The warning that a result is not a promise. The page shows it at the top
 * while anything is open: a photo's reading is best effort, and a sweep's
 * readings are only as good as the NanoVNA's calibration.
 */

import type { Doc } from "./model";

export function Disclaimer({ source, id }: { source: NonNullable<Doc["source"]>; id?: string }): React.ReactElement {
  return (
    <p className="disclaimer" id={id}>
      <span className="line"><b>Check before you transmit.</b> {
        source === "image"
          ? "Reading a photo is best effort, so confirm each result on your NanoVNA."
          : "Readings come from your NanoVNA as it is calibrated, so confirm each result on the device."
      }</span>
      <span className="line"><b>Transmit at your own risk!</b> NanoBands and its author are not responsible for damages to your system.</span>
    </p>
  );
}
