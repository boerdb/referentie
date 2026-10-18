"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Share2, Trash2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useToast } from "@/components/ui/Toaster";
import type { Highlight, HighlightRect } from "@/lib/library/hooks";
import { pdfFileNameFromTitle, shareOrDownloadPdf } from "@/lib/share/files";
import { cn } from "@/lib/utils";

export const HIGHLIGHT_COLORS = {
  yellow: { label: "Geel", fill: "rgba(250, 204, 21, 0.38)", dot: "#facc15" },
  green: { label: "Groen", fill: "rgba(74, 222, 128, 0.35)", dot: "#4ade80" },
  blue: { label: "Blauw", fill: "rgba(96, 165, 250, 0.35)", dot: "#60a5fa" },
  pink: { label: "Roze", fill: "rgba(244, 114, 182, 0.35)", dot: "#f472b6" },
  orange: { label: "Oranje", fill: "rgba(251, 146, 60, 0.38)", dot: "#fb923c" },
} as const;

export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;

type NewHighlight = { page: number; quote: string; rects: HighlightRect[]; color: HighlightColor };

type Props = {
  url: string;
  title: string;
  highlights?: Highlight[];
  onAddHighlight?: (input: NewHighlight) => void;
  onDeleteHighlight?: (id: string) => void;
  /** Naar een pagina springen; `nonce` maakt herhaald springen naar dezelfde pagina mogelijk. */
  focus?: { page: number; nonce: number } | null;
  /** Werkbalk boven de pagina's (bijv. keuze van bijlage). */
  header?: React.ReactNode;
};

type PageSize = { w: number; h: number };

const PAGE_GAP = 12;
const PADDING = 12;

/**
 * PDF-weergave met pdf.js: pagina's worden pas gerenderd als ze in beeld komen, met een
 * tekstlaag om te selecteren en markeren. Markeringen staan als fracties van de pagina
 * opgeslagen, zodat ze bij elke breedte op de juiste plek liggen.
 */
export function PdfViewer({
  url,
  title,
  highlights = [],
  onAddHighlight,
  onDeleteHighlight,
  focus,
  header,
}: Props) {
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [sharing, setSharing] = useState(false);
  const [selection, setSelection] = useState<{ x: number; y: number; items: Omit<NewHighlight, "color">[] } | null>(null);
  const [active, setActive] = useState<{ id: string; x: number; y: number } | null>(null);

  // Document laden (één keer per URL).
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        loaded = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        const first = (await loaded.getPage(1)).getViewport({ scale: 1 });
        // Tot een pagina geladen is, dezelfde verhouding als pagina 1 aannemen.
        setSizes(Array.from({ length: loaded.numPages }, () => ({ w: first.width, h: first.height })));
        setDoc(loaded);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "PDF laden mislukt");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      setDoc(null);
      void loaded?.destroy();
    };
  }, [url]);

  // Breedte volgen (pagina's vullen de beschikbare ruimte).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer = 0;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = Math.max(0, Math.floor(el.clientWidth - PADDING * 2));
        setWidth((prev) => (Math.abs(prev - next) >= 8 ? next : prev));
      }, 120);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  // Naar een pagina springen.
  useEffect(() => {
    if (!focus || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-page="${focus.page}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focus, doc]);

  const onPageSize = useCallback((index: number, size: PageSize) => {
    setSizes((prev) => {
      const current = prev[index];
      if (!current || (Math.abs(current.w - size.w) < 0.5 && Math.abs(current.h - size.h) < 0.5)) return prev;
      const next = [...prev];
      next[index] = size;
      return next;
    });
  }, []);

  /** Na selecteren: tekst per pagina omzetten naar rechthoeken (fracties van de pagina). */
  function captureSelection() {
    const root = scrollRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0 || !onAddHighlight) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const pages = [...root.querySelectorAll<HTMLElement>("[data-page]")].map((el) => ({
      page: Number(el.dataset.page),
      box: el.getBoundingClientRect(),
    }));
    const byPage = new Map<number, HighlightRect[]>();
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = pages.find((p) => cx >= p.box.left && cx <= p.box.right && cy >= p.box.top && cy <= p.box.bottom);
      if (!hit) continue;
      const list = byPage.get(hit.page) ?? [];
      list.push({
        x: (r.left - hit.box.left) / hit.box.width,
        y: (r.top - hit.box.top) / hit.box.height,
        w: r.width / hit.box.width,
        h: r.height / hit.box.height,
      });
      byPage.set(hit.page, list);
    }
    if (byPage.size === 0) {
      setSelection(null);
      return;
    }
    const quote = sel.toString().replace(/\s+/g, " ").trim();
    const last = [...range.getClientRects()].at(-1)!;
    const rootBox = root.getBoundingClientRect();
    setActive(null);
    setSelection({
      x: Math.min(last.right - rootBox.left + root.scrollLeft, root.clientWidth - 180),
      y: last.bottom - rootBox.top + root.scrollTop + 6,
      items: [...byPage].map(([page, rects]) => ({ page, rects: mergeRects(rects), quote })),
    });
  }

  function addHighlight(color: HighlightColor) {
    if (!selection || !onAddHighlight) return;
    for (const item of selection.items) onAddHighlight({ ...item, color });
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  /** Klik zonder selectie: zit er een markering onder de muis? */
  function onClick(e: React.MouseEvent) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const pageEl = (e.target as HTMLElement).closest<HTMLElement>("[data-page]");
    const root = scrollRef.current;
    if (!pageEl || !root) {
      setActive(null);
      return;
    }
    const page = Number(pageEl.dataset.page);
    const box = pageEl.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width;
    const py = (e.clientY - box.top) / box.height;
    const hit = highlights.find(
      (h) => h.page === page && h.rects.some((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h),
    );
    if (!hit || !onDeleteHighlight) {
      setActive(null);
      return;
    }
    const rootBox = root.getBoundingClientRect();
    setActive({ id: hit.id, x: e.clientX - rootBox.left + root.scrollLeft, y: e.clientY - rootBox.top + root.scrollTop + 8 });
  }

  async function sharePdf() {
    if (sharing) return;
    setSharing(true);
    try {
      await shareOrDownloadPdf(url, { fileName: pdfFileNameFromTitle(title), title });
    } catch (err) {
      toast.error("Delen mislukt", err instanceof Error ? err.message : undefined);
    } finally {
      setSharing(false);
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)]"
      style={{ background: "var(--pdf-bg)" }}
    >
      {header}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 lg:hidden">
        <p className="truncate text-xs" style={{ color: "var(--pdf-chrome)" }}>
          {status === "loading" ? "PDF laden…" : title}
        </p>
        <button
          type="button"
          disabled={sharing}
          onClick={() => void sharePdf()}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--accent)]"
        >
          <Share2 className="h-3.5 w-3.5" />
          {sharing ? "Bezig…" : "Delen"}
        </button>
      </div>
      {status === "error" && (
        <div className="space-y-2 p-4 text-center text-sm text-[var(--danger)]">
          <p>{error}</p>
          <button type="button" disabled={sharing} onClick={() => void sharePdf()} className="underline">
            PDF delen / downloaden
          </button>
        </div>
      )}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch]"
        style={{ padding: PADDING, scrollbarGutter: "stable" }}
        onMouseUp={captureSelection}
        onTouchEnd={() => window.setTimeout(captureSelection, 250)}
        onKeyUp={captureSelection}
        onClick={onClick}
      >
        {status === "loading" && (
          <p className="pt-3 text-center text-sm" style={{ color: "var(--pdf-chrome)" }}>
            PDF laden…
          </p>
        )}
        {doc &&
          width > 0 &&
          sizes.map((size, index) => (
            <PdfPage
              key={index}
              doc={doc}
              pageNumber={index + 1}
              width={width}
              size={size}
              root={scrollRef}
              highlights={highlights.filter((h) => h.page === index + 1)}
              onSize={onPageSize}
              title={title}
            />
          ))}

        {selection && (
          <div
            className="absolute z-20 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-[var(--shadow-lg)]"
            style={{ left: Math.max(8, selection.x - 120), top: selection.y }}
            onMouseUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
          >
            <span className="px-1.5 text-xs text-[var(--text-muted)]">Markeren</span>
            {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
              <button
                key={c}
                type="button"
                title={HIGHLIGHT_COLORS[c].label}
                aria-label={`Markeren in ${HIGHLIGHT_COLORS[c].label.toLowerCase()}`}
                onClick={(e) => {
                  e.stopPropagation();
                  addHighlight(c);
                }}
                className="h-6 w-6 rounded-full ring-1 ring-black/10 max-lg:h-9 max-lg:w-9"
                style={{ background: HIGHLIGHT_COLORS[c].dot }}
              />
            ))}
          </div>
        )}
        {active && (
          <div
            className="absolute z-20 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-[var(--shadow-lg)]"
            style={{ left: Math.max(8, active.x - 60), top: active.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--bg-hover)]"
              onClick={() => {
                onDeleteHighlight?.(active.id);
                setActive(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Markering verwijderen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Rechthoeken op dezelfde regel samenvoegen, zodat een markering geen losse blokjes wordt. */
function mergeRects(rects: HighlightRect[]): HighlightRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: HighlightRect[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && Math.abs(last.y - r.y) < r.h * 0.5 && r.x <= last.x + last.w + 0.01) {
      const right = Math.max(last.x + last.w, r.x + r.w);
      const bottom = Math.max(last.y + last.h, r.y + r.h);
      last.x = Math.min(last.x, r.x);
      last.y = Math.min(last.y, r.y);
      last.w = right - last.x;
      last.h = bottom - last.y;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

function PdfPage({
  doc,
  pageNumber,
  width,
  size,
  root,
  highlights,
  onSize,
  title,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  size: PageSize;
  root: React.RefObject<HTMLDivElement | null>;
  highlights: Highlight[];
  onSize: (index: number, size: PageSize) => void;
  title: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const height = Math.round((width * size.h) / size.w);

  // Pas renderen als de pagina (bijna) in beeld is.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { root: root.current, rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (!visible || width <= 0) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let textLayer: { cancel: () => void } | null = null;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        onSize(pageNumber - 1, { w: base.width, h: base.height });
        const scale = width / base.width;
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        await renderTask.promise;
        if (cancelled || !textRef.current) return;
        const container = textRef.current;
        container.replaceChildren();
        container.style.setProperty("--scale-factor", String(scale));
        const layer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container,
          viewport,
        });
        textLayer = layer;
        await layer.render();
      } catch (err) {
        // Annuleren bij wisselen van breedte is geen fout.
        if (!(err instanceof Error && err.name === "RenderingCancelledException")) {
          console.warn("[pdf page]", pageNumber, err);
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [visible, width, doc, pageNumber, onSize]);

  return (
    <div
      ref={wrapRef}
      data-page={pageNumber}
      className="relative mx-auto overflow-hidden rounded-[2px] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.12),0_0_0_1px_rgba(16,24,40,0.04)]"
      style={{ width, height, marginBottom: PAGE_GAP }}
      aria-label={`${title} — pagina ${pageNumber}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {highlights.flatMap((h) =>
          h.rects.map((r, i) => (
            <div
              key={`${h.id}-${i}`}
              className={cn("absolute rounded-[1px] mix-blend-multiply")}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                background:
                  HIGHLIGHT_COLORS[(h.color as HighlightColor) in HIGHLIGHT_COLORS ? (h.color as HighlightColor) : "yellow"].fill,
              }}
            />
          )),
        )}
      </div>
      <div ref={textRef} className="textLayer" />
    </div>
  );
}
