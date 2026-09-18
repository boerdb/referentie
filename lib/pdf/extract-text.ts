import { findFirstDoiInText } from "@/lib/doi/from-text";

const MAX_PAGES = 6;

async function extractWithPdfJs(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    standardFontDataUrl: undefined,
    disableAutoFetch: true,
  }).promise;

  const parts: string[] = [];
  const pages = Math.min(doc.numPages, MAX_PAGES);
  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(line);
  }
  await doc.destroy();
  return parts.join("\n");
}

/** Ruwe tekst uit PDF-bytes (pdf.js, anders latin1-scan). */
export async function extractTextFromPdfBuffer(
  data: Uint8Array,
): Promise<string> {
  try {
    return await extractWithPdfJs(data);
  } catch {
    return Buffer.from(data).toString("latin1");
  }
}

export async function findDoiInPdfBuffer(
  data: Uint8Array,
): Promise<string | null> {
  const fromText = findFirstDoiInText(await extractTextFromPdfBuffer(data));
  if (fromText) return fromText;
  const raw = Buffer.from(data).toString("latin1");
  return findFirstDoiInText(raw);
}
