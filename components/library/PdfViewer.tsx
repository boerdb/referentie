"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  url: string;
  title: string;
};

export function PdfViewer({ url, title }: Props) {
  const measureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const measure = measureRef.current;
    const pages = containerRef.current;
    if (!measure || !pages) return;

    const measureEl: HTMLDivElement = measure;
    const pageRoot: HTMLDivElement = pages;

    let cancelled = false;
    let timer = 0;
    let inFlight = false;
    let queuedWidth = 0;
    let lastWidth = 0;
    let generation = 0;

    async function renderAt(width: number) {
      if (cancelled || width < 80) return;
      inFlight = true;
      const gen = ++generation;
      setError(null);
      if (pageRoot.childElementCount === 0) setStatus("loading");

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        if (cancelled || gen !== generation) {
          await doc.destroy();
          return;
        }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const frag = document.createDocumentFragment();

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          if (cancelled || gen !== generation) break;
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
          const ctx = canvas.getContext("2d");
          if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
          frag.appendChild(canvas);
        }

        if (!cancelled && gen === generation) {
          pageRoot.replaceChildren(frag);
          setStatus("ready");
        }
        await doc.destroy();
      } catch (err) {
        if (cancelled || gen !== generation) return;
        setError(err instanceof Error ? err.message : "PDF laden mislukt");
        setStatus("error");
      } finally {
        inFlight = false;
        if (!cancelled && queuedWidth >= 80 && Math.abs(queuedWidth - lastWidth) >= 24) {
          const next = queuedWidth;
          queuedWidth = 0;
          lastWidth = next;
          void renderAt(next);
        }
      }
    }

    const schedule = () => {
      const w = Math.floor(measureEl.clientWidth);
      if (w < 80) return;
      if (lastWidth > 0 && Math.abs(w - lastWidth) < 24) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const w2 = Math.floor(measureEl.clientWidth);
        if (w2 < 80) return;
        if (lastWidth > 0 && Math.abs(w2 - lastWidth) < 24) return;
        if (inFlight) {
          queuedWidth = w2;
          return;
        }
        lastWidth = w2;
        void renderAt(w2);
      }, 180);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(measureEl);
    return () => {
      cancelled = true;
      generation += 1;
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [url, title]);

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
      {status === "error" && (
        <div className="space-y-2 p-4 text-center text-sm text-[var(--danger)]">
          <p>{error}</p>
          <a href={url} className="underline" target="_blank" rel="noreferrer">
            Open PDF
          </a>
        </div>
      )}
      <div ref={measureRef} className="relative min-h-0 flex-1 overflow-hidden">
        {status === "loading" && (
          <p
            className="pointer-events-none absolute inset-x-0 top-3 z-10 text-center text-sm"
            style={{ color: "var(--pdf-chrome)" }}
          >
            PDF laden…
          </p>
        )}
        <div
          ref={containerRef}
          className="h-full overflow-auto p-2 [-webkit-overflow-scrolling:touch]"
          style={{ scrollbarGutter: "stable" }}
        />
      </div>
    </div>
  );
}
