/** Normaliseert een DOI of doi.org-URL naar `10.…/…`. */
export function normalizeDoi(raw: string): string {
  return raw
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

/**
 * Verwijdert PDF-/URL-artefacten die Crossref laten falen terwijl doi.org
 * (vaak alleen de eerste twee padsegmenten) wél het artikel toont.
 */
export function cleanDoiForLookup(raw: string): string {
  let d = normalizeDoi(raw);
  d = (d.split(/[?#]/)[0] ?? d).trim();
  d = d.replace(/\.pdf$/i, "");
  d = d.replace(
    /\/+(pdf|epdf|fulltext|full|abstract|html|download|meta|suppl|supplementary)\/?$/i,
    "",
  );
  d = d.replace(/\/Title[A-Za-z0-9._-]*$/i, "");
  d = d.replace(/[.,;:)\]}>]+$/g, "");

  const parts = d.split("/");
  if (parts.length >= 3) {
    const extra = parts.slice(2).join("/");
    if (/^(Title|pdf|figure|fig|table|tab|suppl)/i.test(extra)) {
      return `${parts[0]}/${parts[1]}`;
    }
  }
  return d;
}

export function doiLookupCandidates(raw: string): string[] {
  const cleaned = cleanDoiForLookup(raw);
  const base = normalizeDoi(raw).split(/[?#]/)[0] ?? "";
  const out: string[] = [];
  const add = (c: string) => {
    const v = c.trim();
    if (v && !out.includes(v)) out.push(v);
  };
  add(cleaned);
  add(base);
  const parts = cleaned.split("/");
  if (parts.length > 2) add(`${parts[0]}/${parts[1]}`);
  return out;
}
