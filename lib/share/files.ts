/** Client-side share/download helpers (Web Share API + blob download). */

function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "document";
}

export function pdfFileNameFromTitle(title: string): string {
  return `${sanitizeFileName(title)}.pdf`;
}

export function canShareFiles(file: File): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

export function canShareText(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

async function fetchPdfBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(res.status === 404 ? "Geen PDF voor dit artikel." : "PDF ophalen mislukt.");
  }
  return res.blob();
}

function triggerDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

/** Opens the native share sheet on iOS/Android, or downloads the PDF as fallback. */
export async function shareOrDownloadPdf(
  url: string,
  opts: { fileName: string; title?: string },
): Promise<"shared" | "downloaded"> {
  const blob = await fetchPdfBlob(url);
  const fileName = opts.fileName.endsWith(".pdf")
    ? opts.fileName
    : `${opts.fileName}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });

  if (canShareFiles(file)) {
    try {
      await navigator.share({
        files: [file],
        title: opts.title ?? fileName,
      });
      return "shared";
    } catch (err) {
      // User dismissed the sheet — not an error.
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared";
      }
      throw err;
    }
  }

  triggerDownload(blob, fileName);
  return "downloaded";
}

/** Share plain text (citaat/metadata) via the system share sheet, or copy. */
export async function shareOrCopyText(
  text: string,
  opts?: { title?: string },
): Promise<"shared" | "copied"> {
  if (canShareText()) {
    try {
      await navigator.share({
        title: opts?.title,
        text,
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared";
      }
      // Fall through to clipboard.
    }
  }
  if (!(await copyRichText(escapeHtml(text).replace(/\n/g, "<br>"), text))) {
    throw new Error("Kopiëren naar het klembord is niet gelukt.");
  }
  return "copied";
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Terugval zonder klembord-API (gewone http:// op het LAN is geen "secure context"):
 * de tekst opgemaakt in een verborgen element zetten, selecteren en "kopiëren".
 */
function copyWithSelection(html: string): boolean {
  const el = document.createElement("div");
  el.contentEditable = "true";
  el.innerHTML = html;
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  el.style.whiteSpace = "pre-wrap";
  document.body.appendChild(el);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection?.removeAllRanges();
  selection?.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  selection?.removeAllRanges();
  el.remove();
  return ok;
}

/** Een willekeurig bestand (bijv. .ris of .bib) delen op de telefoon of downloaden. */
export async function shareOrDownloadFile(
  blob: Blob,
  fileName: string,
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], fileName, { type: blob.type || "text/plain" });
  // Alleen op aanraakschermen de share-sheet; op desktop gewoon downloaden.
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }
  triggerDownload(blob, fileName);
  return "downloaded";
}

/**
 * Kopieert opgemaakte tekst (cursief tijdschrift, nummering) mét platte tekst als terugval,
 * zodat plakken in Word of Pages de opmaak behoudt.
 */
export async function copyRichText(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    /* sommige browsers staan alleen platte tekst toe */
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* geen toegang tot het klembord */
  }
  return copyWithSelection(html);
}
