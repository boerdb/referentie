import { normalizeDoi } from "@/lib/doi/crossref";

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
    const normalized = normalizeDoi(candidate);
    if (normalized.startsWith("10.") && normalized.includes("/")) {
      return normalized;
    }
  }
  return null;
}
