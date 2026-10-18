import { cleanDoiForLookup, normalizeDoi } from "@/lib/doi/normalize";

/** Crossref-achtige DOI in vrije tekst (eerste treffer). */
const DOI_IN_TEXT =
  /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+(?:[-._;()/:A-Za-z0-9]*))/gi;

function trimDoiTail(raw: string): string {
  return raw.replace(/[.,;)\]}>]+$/g, "").trim();
}

export function findFirstDoiInText(text: string): string | null {
  if (!text) return null;
  DOI_IN_TEXT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DOI_IN_TEXT.exec(text)) !== null) {
    const candidate = trimDoiTail(match[1] ?? match[0]);
    const normalized = cleanDoiForLookup(normalizeDoi(candidate));
    if (normalized.startsWith("10.") && normalized.includes("/")) {
      return normalized;
    }
  }
  return null;
}

/** Alle DOI's in vrije tekst, zonder dubbelen, in volgorde van voorkomen. */
export function findAllDoisInText(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const match of text.matchAll(DOI_IN_TEXT)) {
    const normalized = cleanDoiForLookup(normalizeDoi(trimDoiTail(match[1] ?? match[0])));
    if (normalized.startsWith("10.") && normalized.includes("/") && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out;
}
