import path from "path";
import { pathToFileURL } from "url";
import { findAllDoisInText } from "@/lib/doi/from-text";

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

/**
 * pdf.js voor de server (Node). pdf.js draait hier zonder echte worker ("fake worker") en
 * zoekt dan `globalThis.pdfjsWorker`; zonder die zoekt hij een bestand naast de gebundelde
 * code, dat in de Next-build niet bestaat. Daarom laden we de worker zelf vooraf in.
 */
async function loadPdfjs(): Promise<Pdfjs> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const g = globalThis as { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) {
    g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }
  // Terugval als de worker toch als bestand geladen wordt.
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    ),
  ).href;
  return pdfjs;
}

async function openPdf(data: Uint8Array) {
  const pdfjs = await loadPdfjs();
  // Kopie: pdf.js mag de buffer overnemen, de aanroeper heeft hem nog nodig.
  return pdfjs.getDocument({
    data: data.slice(),
    useSystemFonts: true,
    disableAutoFetch: true,
    verbosity: 0,
  }).promise;
}

type PdfDoc = Awaited<ReturnType<typeof openPdf>>;

async function pageText(doc: PdfDoc, pageNum: number): Promise<string> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  page.cleanup();
  return text;
}

const FULLTEXT_MAX_PAGES = 400;
const FULLTEXT_MAX_CHARS = 2_000_000;

/** Alle tekst van een PDF voor zoeken (max. 400 pagina's / 2 mln. tekens). */
export async function extractFullText(
  data: Uint8Array,
): Promise<{ text: string; pageCount: number }> {
  const doc = await openPdf(data);
  const parts: string[] = [];
  let length = 0;
  try {
    const pages = Math.min(doc.numPages, FULLTEXT_MAX_PAGES);
    for (let pageNum = 1; pageNum <= pages && length < FULLTEXT_MAX_CHARS; pageNum++) {
      const text = await pageText(doc, pageNum);
      parts.push(text);
      length += text.length;
    }
    return { text: parts.join("\n").slice(0, FULLTEXT_MAX_CHARS), pageCount: doc.numPages };
  } finally {
    await doc.destroy();
  }
}

export type PdfIdentification = {
  /** DOI's uit de documentinformatie en XMP-metadata (meestal de eigen DOI). */
  metadataDois: string[];
  /** Tekst van pagina 1 en 2 (titel, auteurs, DOI van het artikel). */
  firstPages: string;
  /** DOI's op pagina 1–2, in volgorde van voorkomen. */
  firstPageDois: string[];
  /** Overige DOI's op pagina 3–6 (vaak uit de literatuurlijst). */
  laterDois: string[];
};

/** Gegevens om te bepalen welk artikel een PDF is. */
export async function readPdfForIdentification(data: Uint8Array): Promise<PdfIdentification> {
  const doc = await openPdf(data);
  try {
    let metaText = "";
    try {
      const meta = await doc.getMetadata();
      metaText = `${JSON.stringify(meta.info ?? {})}\n${meta.metadata?.getRaw?.() ?? ""}`;
    } catch {
      /* geen metadata */
    }
    const first: string[] = [];
    const later: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 6); n++) {
      (n <= 2 ? first : later).push(await pageText(doc, n));
    }
    const firstPages = first.join("\n");
    return {
      metadataDois: findAllDoisInText(metaText),
      firstPages,
      firstPageDois: findAllDoisInText(firstPages),
      laterDois: findAllDoisInText(later.join("\n")),
    };
  } finally {
    await doc.destroy();
  }
}
