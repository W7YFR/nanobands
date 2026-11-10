/* A modal question that takes a number, with one action and Cancel. Enter
 * answers it. Escape or a click outside cancels. */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function AskNumber({ title, label, unit, action, onAnswer, onCancel }: {
  title: string;
  /** What the number is, beside the field. */
  label: string;
  unit: string;
  action: string;
  onAnswer(n: number): void;
  onCancel(): void;
}): React.ReactElement {
  const [text, setText] = useState("");
  const n = parseFloat(text), ok = Number.isFinite(n) && n > 0;
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCancel]);

  return createPortal(
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"
        onSubmit={(e) => { e.preventDefault(); if (ok) onAnswer(n); }}>
        <h2 id="modalTitle">{title}</h2>
        <label className="modal-field">
          <span>{label}</span>
          <input type="number" id="askNumber" autoFocus step="any" min="0" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
          <span>{unit}</span>
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={!ok}>{action}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
