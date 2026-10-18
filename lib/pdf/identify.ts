import { fetchMetadataByDoi } from "@/lib/doi/crossref";
import { normalizeTitle } from "@/lib/references/normalize-title";
import type { ReferenceInput } from "@/lib/references/types";
import { readPdfForIdentification } from "./extract-text";

const MAX_CANDIDATES = 5;

export type PdfMatch = {
  doi: string;
  metadata: ReferenceInput;
  source: "metadata" | "page" | "filename";
};

/** Elsevier-bestandsnamen ("1-s2.0-S0883944126002467-main.pdf") bevatten de PII van het artikel. */
async function doiFromElsevierFileName(fileName: string): Promise<string | null> {
  const pii = fileName.match(/S\d{4}-?\d{3}[\dX]\d{6,}[\dX]?/i)?.[0];
  if (!pii) return null;
  try {
    const res = await fetch(
      `https://api.crossref.org/works?rows=1&filter=alternative-id:${encodeURIComponent(pii)}&mailto=support@clvs.nl`,
      { headers: { "User-Agent": "ReferentiePWA/1.0 (mailto:support@clvs.nl)" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { items?: { DOI?: string }[] } };
    return data.message?.items?.[0]?.DOI ?? null;
  } catch {
    return null;
  }
}

/** Staat de titel (of het begin ervan) op de eerste pagina's van de PDF? */
function titleOnPage(title: string, pageText: string): boolean {
  const t = normalizeTitle(title);
  if (t.length < 12) return false;
  const page = normalizeTitle(pageText);
  // Lange titels lopen soms over regels met afbreekstreepjes; het begin is genoeg.
  return page.includes(t) || page.includes(t.slice(0, 50));
}

/**
 * Bepaalt welk artikel een PDF is. Kandidaat-DOI's komen uit de metadata en van pagina 1–2;
 * DOI's verderop (literatuurlijst) alleen als laatste. Een kandidaat telt pas als de titel
 * volgens Crossref ook echt op de eerste pagina's staat, zodat een DOI uit de literatuurlijst
 * nooit het artikel bepaalt. Geen zekere match: `null` (de aanroeper maakt dan een kaal artikel).
 */
export async function identifyPdf(data: Uint8Array, fileName = ""): Promise<PdfMatch | null> {
  const info = await readPdfForIdentification(data);
  const fromName = await doiFromElsevierFileName(fileName);
  const candidates = [
    ...(fromName ? [{ doi: fromName.toLowerCase(), source: "filename" as const }] : []),
    ...info.metadataDois.map((doi) => ({ doi, source: "metadata" as const })),
    ...info.firstPageDois.map((doi) => ({ doi, source: "page" as const })),
    ...info.laterDois.map((doi) => ({ doi, source: "page" as const })),
  ]
    .filter((c, i, all) => all.findIndex((x) => x.doi === c.doi) === i)
    .slice(0, MAX_CANDIDATES);

  const hasText = info.firstPages.replace(/\s/g, "").length > 200;
  for (const candidate of candidates) {
    let metadata: ReferenceInput;
    try {
      metadata = await fetchMetadataByDoi(candidate.doi);
    } catch {
      continue;
    }
    if (titleOnPage(metadata.title, info.firstPages)) {
      return { doi: candidate.doi, metadata, source: candidate.source };
    }
    // Gescande PDF zonder tekst: dan alleen de DOI uit metadata of bestandsnaam vertrouwen.
    if (!hasText && candidate.source !== "page") {
      return { doi: candidate.doi, metadata, source: candidate.source };
    }
  }
  return null;
}
