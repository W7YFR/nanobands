/* Files dropped or pasted anywhere on the page.
 *
 * On the document rather than on the drop zone, so a photo dropped on the
 * chart or the landing loads just the same. Returns whether a drag is over the
 * page, for the drop zone to light up.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function useFileDrop(onFile: (file: File) => void): boolean {
  const [over, setOver] = useState(false);
  const sink = useRef(onFile);
  useLayoutEffect(() => { sink.current = onFile; });

  useEffect(() => {
    const enter = (e: Event): void => { e.preventDefault(); setOver(true); };
    const leave = (e: Event): void => { e.preventDefault(); setOver(false); };
    const drop = (e: DragEvent): void => {
      const f = e.dataTransfer?.files[0];
      if (f) sink.current(f);
    };
    const paste = (e: ClipboardEvent): void => {
      const it = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const f = it?.getAsFile();
      if (f) sink.current(f);
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragover", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("drop", leave);
    document.addEventListener("drop", drop);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragover", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("drop", leave);
      document.removeEventListener("drop", drop);
      document.removeEventListener("paste", paste);
    };
  }, []);

  return over;
}
