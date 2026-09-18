const LOOKUP_MS = 10_000;
const MIN_ABSTRACT_LENGTH = 40;

/** Zet JATS-/HTML-opmaak om in platte tekst met leesbare kopjes. */
export function stripAbstractHtml(html: string): string {
  return html
    .replace(/<\/(?:jats:)?title>/gi, ": ")
    .replace(/<\/h[1-6]>/gi, ": ")
    .replace(/<\/(?:jats:)?(?:p|sec|abstract)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/\s+([:;,.])/g, "$1")
    .trim();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type EuropePmcResponse = {
  resultList?: { result?: { abstractText?: string }[] };
};

async function fromEuropePmc(doi: string): Promise<string | null> {
  const query = encodeURIComponent(`DOI:"${doi}"`);
  const json = await fetchJson<EuropePmcResponse>(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&resultType=core&format=json&pageSize=1`,
  );
  const text = json?.resultList?.result?.[0]?.abstractText;
  return text ? stripAbstractHtml(text) : null;
}

type OpenAlexWork = {
  abstract_inverted_index?: Record<string, number[]>;
};

function reconstructInvertedIndex(index: Record<string, number[]>): string {
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  return words.filter((w) => w != null).join(" ");
}

async function fromOpenAlex(doi: string): Promise<string | null> {
  const json = await fetchJson<OpenAlexWork>(
    `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?mailto=support@clvs.nl`,
  );
  const index = json?.abstract_inverted_index;
  if (!index) return null;
  const text = reconstructInvertedIndex(index).trim();
  return text || null;
}

/**
 * Haalt een abstract op bij bronnen buiten Crossref/doi.org, voor uitgevers die
 * geen abstract aanleveren (o.a. BMC).
 */
export async function fetchAbstractByDoi(doi: string): Promise<string | null> {
  for (const fn of [fromEuropePmc, fromOpenAlex]) {
    const text = await fn(doi);
    if (text && text.length >= MIN_ABSTRACT_LENGTH) return text;
  }
  return null;
}
