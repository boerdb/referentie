"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  url: string;
  title: string;
};

export function PdfViewer({ url, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      const container = containerRef.current;
      if (!container) return;
      setStatus("loading");
      setError(null);
      container.replaceChildren();

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }

        const width = Math.max(container.clientWidth, 280);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          if (cancelled) break;
          const page = await doc.getPage(pageNum);
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * dpr;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.style.marginBottom = "8px";
          canvas.dataset.page = String(pageNum);
          canvas.setAttribute("aria-label", `${title} — pagina ${pageNum}`);
          container.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (!cancelled) setStatus("ready");
        await doc.destroy();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "PDF laden mislukt");
        setStatus("error");
      }
    }

    void renderPdf();
    return () => {
      cancelled = true;
    };
  }, [url, title]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)]"
      style={{ background: "var(--pdf-bg)" }}
    >
      {status === "loading" && (
        <p className="p-4 text-center text-sm" style={{ color: "var(--pdf-chrome)" }}>
          PDF laden…
        </p>
      )}
      {status === "error" && (
        <div className="space-y-2 p-4 text-center text-sm text-[var(--danger)]">
          <p>{error}</p>
          <a href={url} className="underline" target="_blank" rel="noreferrer">
            Open PDF
          </a>
        </div>
      )}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto p-2" />
    </div>
  );
}
