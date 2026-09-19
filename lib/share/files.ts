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
  await navigator.clipboard.writeText(text);
  return "copied";
}
