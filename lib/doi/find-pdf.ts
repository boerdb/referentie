import { normalizeTitle } from "@/lib/references/normalize-title";
import type { ReferenceRecord } from "@/lib/references/types";
import { downloadOpenAccessPdf } from "./oa-pdf";

const MAILTO = "support@clvs.nl";
const USER_AGENT = "ReferentiePWA/1.0 (mailto:support@clvs.nl)";
const TIMEOUT_MS = 10_000;

type Candidate = { doi: string; title: string; year: number | null };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Overeenkomst van twee titels (0–1) op woordparen, ongevoelig voor leestekens en hoofdletters. */
function similarity(a: string, b: string): number {
  const pairs = (s: string) => {
    const t = normalizeTitle(s);
    const out = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  };
  const x = pairs(a);
  const y = pairs(b);
  if (x.size === 0 || y.size === 0) return 0;
  let same = 0;
  for (const p of x) if (y.has(p)) same++;
  return (2 * same) / (x.size + y.size);
}

function best(ref: ReferenceRecord, candidates: Candidate[]): Candidate | null {
  const scored = candidates
    .map((c) => ({ c, score: similarity(ref.title, c.title) }))
    // Jaar mag één afwijken (online eerst, druk later).
    .filter(({ c }) => !ref.year || !c.year || Math.abs(c.year - ref.year) <= 1)
    .sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score >= 0.88 ? scored[0].c : null;
}

/** DOI zoeken op titel (en eerste auteur), eerst via Crossref, anders via OpenAlex. */
export async function findDoiByTitle(ref: ReferenceRecord): Promise<string | null> {
  const author = ref.authors[0]?.familyName ?? "";
  const crossref = await getJson<{
    message?: { items?: { DOI?: string; title?: string[]; issued?: { "date-parts"?: number[][] } }[] };
  }>(
    `https://api.crossref.org/works?rows=5&mailto=${MAILTO}&query.bibliographic=${encodeURIComponent(
      [ref.title, author, ref.year].filter(Boolean).join(" "),
    )}`,
  );
  const fromCrossref = best(
    ref,
    (crossref?.message?.items ?? [])
      .filter((i) => i.DOI && i.title?.[0])
      .map((i) => ({
        doi: i.DOI!,
        title: i.title![0],
        year: i.issued?.["date-parts"]?.[0]?.[0] ?? null,
      })),
  );
  if (fromCrossref) return fromCrossref.doi;

  const openalex = await getJson<{
    results?: { doi?: string | null; title?: string | null; publication_year?: number | null }[];
  }>(
    `https://api.openalex.org/works?per-page=5&mailto=${MAILTO}&search=${encodeURIComponent(ref.title)}`,
  );
  const fromOpenAlex = best(
    ref,
    (openalex?.results ?? [])
      .filter((r) => r.doi && r.title)
      .map((r) => ({
        doi: r.doi!.replace(/^https?:\/\/doi\.org\//, ""),
        title: r.title!,
        year: r.publication_year ?? null,
      })),
  );
  return fromOpenAlex?.doi ?? null;
}

export type PdfSearchLink = { label: string; url: string };

/** Plekken om zelf te zoeken als er geen vrij beschikbare PDF is. */
export function manualPdfLinks(ref: ReferenceRecord, doi: string | null): PdfSearchLink[] {
  const query = encodeURIComponent(ref.title);
  const links: PdfSearchLink[] = [];
  if (doi) links.push({ label: "Uitgever (via DOI)", url: `https://doi.org/${doi}` });
  if (ref.pmid) links.push({ label: "PubMed", url: `https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/` });
  else links.push({ label: "PubMed", url: `https://pubmed.ncbi.nlm.nih.gov/?term=${query}` });
  links.push({ label: "Europe PMC", url: `https://europepmc.org/search?query=${query}` });
  links.push({ label: "Google Scholar", url: `https://scholar.google.com/scholar?q=${query}` });
  return links;
}

export type FindPdfResult =
  | { found: true; doi: string; buffer: Buffer; fileName: string }
  | { found: false; doi: string | null; links: PdfSearchLink[] };

/** Zoekt een vrij beschikbare (open access) PDF voor een artikel. */
export async function findPdfForReference(ref: ReferenceRecord): Promise<FindPdfResult> {
  const doi = ref.doi?.trim() || (await findDoiByTitle(ref));
  if (doi) {
    const file = await downloadOpenAccessPdf(doi);
    if (file) return { found: true, doi, buffer: file.buffer, fileName: file.fileName };
  }
  return { found: false, doi, links: manualPdfLinks(ref, doi) };
}
