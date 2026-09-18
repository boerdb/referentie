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
  const [renderWidth, setRenderWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const w = Math.floor(el.clientWidth);
        if (w < 80) return;
        setRenderWidth((prev) => (Math.abs(prev - w) < 8 ? prev : w));
      }, 80);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [url]);

  useEffect(() => {
    if (renderWidth < 80) return;
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

        const width = renderWidth;
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
  }, [url, title, renderWidth]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)]"
      style={{ background: "var(--pdf-bg)" }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 lg:hidden">
        <p className="truncate text-xs" style={{ color: "var(--pdf-chrome)" }}>
          {status === "loading" ? "PDF laden…" : title}
        </p>
        <a
          href={url}
          className="shrink-0 text-xs font-medium text-[var(--accent)] underline"
          target="_blank"
          rel="noreferrer"
        >
          Openen
        </a>
      </div>
      {status === "loading" && (
        <p className="hidden p-4 text-center text-sm lg:block" style={{ color: "var(--pdf-chrome)" }}>
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
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto p-2 [-webkit-overflow-scrolling:touch]"
      />
    </div>
  );
}
