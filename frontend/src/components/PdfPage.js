import { useEffect, useRef } from "react";

// Rend une page PDF dans son propre canvas (pour le défilement continu, centré).
export default function PdfPage({ pdf, pageNumber, width }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!pdf || !width) return;
    let cancelled = false;
    let task;
    pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      task = page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      task.promise.catch(() => {});
    });
    return () => { cancelled = true; try { task && task.cancel(); } catch (_) {} };
  }, [pdf, pageNumber, width]);

  return (
    <div data-page={pageNumber} style={{ marginBottom: 12 }}>
      {/* margin auto = centré quand plus étroit que la zone ; défile quand plus large (zoom) */}
      <canvas ref={canvasRef} style={{ display: "block", margin: "0 auto", borderRadius: 8, boxShadow: "var(--shadow)" }} />
    </div>
  );
}
