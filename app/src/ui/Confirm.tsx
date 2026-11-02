/* A modal question with one action and Cancel. Escape or a click outside cancels. */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function Confirm({ title, children, action, onConfirm, onCancel }: {
  title: string;
  children: React.ReactNode;
  action: string;
  onConfirm(): void;
  onCancel(): void;
}): React.ReactElement {
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    go.current?.focus();
    const esc = (e: KeyboardEvent): void => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCancel]);

  return createPortal(
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="modalTitle" aria-describedby="modalText">
        <h2 id="modalTitle">{title}</h2>
        <div id="modalText">{children}</div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" ref={go} onClick={onConfirm}>{action}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
