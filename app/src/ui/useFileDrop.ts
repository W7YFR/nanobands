/* Files dropped or pasted anywhere on the page.
 *
 * On the document rather than on the drop zone, so a photo dropped on the
 * chart or the landing loads just the same. Returns whether files are being
 * dragged over the page, for the page to show where they will go.
 *
 * A drag fires dragenter and dragleave on each element it crosses, so a
 * count of the elements it is in says whether it is still on the page. Only
 * a drag that carries files counts: dragged text is not a file to open.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function useFileDrop(onFile: (file: File) => void): boolean {
  const [over, setOver] = useState(false);
  const sink = useRef(onFile);
  useLayoutEffect(() => { sink.current = onFile; });

  useEffect(() => {
    let depth = 0;
    const files = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent): void => {
      if (!files(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    // Lets the drop happen. The browser fires it again and again during a drag.
    const overPage = (e: DragEvent): void => { if (files(e)) e.preventDefault(); };
    const leave = (e: DragEvent): void => {
      if (!files(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const drop = (e: DragEvent): void => {
      // Always, so a file dropped anywhere never replaces the page.
      e.preventDefault();
      depth = 0;
      setOver(false);
      const f = e.dataTransfer?.files[0];
      if (f) sink.current(f);
    };
    const paste = (e: ClipboardEvent): void => {
      const it = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const f = it?.getAsFile();
      if (f) sink.current(f);
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragover", overPage);
    document.addEventListener("dragleave", leave);
    document.addEventListener("drop", drop);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragover", overPage);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("drop", drop);
      document.removeEventListener("paste", paste);
    };
  }, []);

  return over;
}
