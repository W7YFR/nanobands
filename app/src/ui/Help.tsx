/* A "?" that shows its detail text on hover or keyboard focus, so a card
 * keeps its rows short and the detail is there when wanted.
 */

import { useId } from "react";

export function Help({ text, align = "end" }: {
  text: string;
  /** Which edge of the "?" the text lines up with: "end" opens leftward, for a "?" at a card's right edge. */
  align?: "start" | "end";
}): React.ReactElement {
  const id = useId();
  return (
    <span className={"help " + align} tabIndex={0} aria-describedby={id} aria-label="More information">
      ?
      <span className="tip" role="tooltip" id={id}>{text}</span>
    </span>
  );
}
