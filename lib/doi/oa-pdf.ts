import { cleanDoiForLookup } from "@/lib/doi/normalize";
import { getReference } from "@/lib/references/queries";
import type { ReferenceRecord } from "@/lib/references/types";
import {
  referenceHasPdf,
  savePdfBufferForReference,
} from "@/lib/uploads/pdf";

const LOOKUP_MS = 10_000;
const DOWNLOAD_MS = 20_000;
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_CANDIDATES = 4;
const MAILTO = "support@clvs.nl";
const USER_AGENT = "ReferentiePWA/1.0 (mailto:support@clvs.nl)";

type PdfLocation = { pdf_url?: string | null; url_for_pdf?: string | null; url?: string | null };

type OpenAlexWork = {
  best_oa_location?: PdfLocation | null;
  primary_location?: PdfLocation | null;
  locations?: PdfLocation[] | null;
};

type Unpaywall = {
  best_oa_location?: PdfLocation | null;
  oa_locations?: PdfLocation[] | null;
};

type EuropePmc = {
  resultList?: {
    result?: {
      fullTextUrlList?: {
        fullTextUrl?: { url?: string; documentStyle?: string; availabilityCode?: string }[];
      };
    }[];
  };
};

function isPublicHttpsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return false;
  }
  return true;
}

function addUrl(out: string[], raw: string | null | undefined) {
  const url = raw?.trim();
  if (!url || !isPublicHttpsUrl(url) || out.includes(url)) return;
  out.push(url);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(LOOKUP_MS),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    console.warn("[oa-pdf lookup]", e instanceof Error ? e.message : e);
    return null;
  }
}

async function candidateUrls(doi: string): Promise<string[]> {
  const [openAlex, unpaywall, europePmc] = await Promise.all([
    fetchJson<OpenAlexWork>(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?mailto=${MAILTO}&select=best_oa_location,primary_location,locations`,
    ),
    fetchJson<Unpaywall>(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${MAILTO}`,
    ),
    fetchJson<EuropePmc>(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`DOI:"${doi}"`)}&resultType=core&format=json&pageSize=1`,
    ),
  ]);

  const urls: string[] = [];
  addUrl(urls, openAlex?.best_oa_location?.pdf_url);
  addUrl(urls, openAlex?.primary_location?.pdf_url);
  for (const location of openAlex?.locations ?? []) addUrl(urls, location.pdf_url);

  addUrl(urls, unpaywall?.best_oa_location?.url_for_pdf);
  for (const location of unpaywall?.oa_locations ?? []) {
    addUrl(urls, location.url_for_pdf);
    if (location.url?.toLowerCase().includes(".pdf")) addUrl(urls, location.url);
  }

  for (const link of europePmc?.resultList?.result?.[0]?.fullTextUrlList?.fullTextUrl ?? []) {
    if (link.documentStyle === "pdf" && link.availabilityCode !== "S") addUrl(urls, link.url);
  }

  return urls.slice(0, MAX_CANDIDATES);
}

async function readLimited(res: Response): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PDF_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function downloadPdf(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "application/pdf,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(DOWNLOAD_MS),
    });
    if (!res.ok || !isPublicHttpsUrl(res.url)) return null;
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_PDF_BYTES) return null;
    const buffer = await readLimited(res);
    if (!buffer || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") return null;
    return buffer;
  } catch (e) {
    console.warn("[oa-pdf download]", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function downloadOpenAccessPdf(
  doiRaw: string,
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const doi = cleanDoiForLookup(doiRaw);
  if (!doi.startsWith("10.") || !doi.includes("/")) return null;

  for (const url of await candidateUrls(doi)) {
    const buffer = await downloadPdf(url);
    if (!buffer) continue;
    const fileName = `${doi.replace(/[^\w.\-]+/g, "_").slice(0, 140)}.pdf`;
    return { buffer, fileName };
  }
  return null;
}

/** Koppelt een vrij beschikbare PDF. Een bestaand bestand blijft staan. */
export async function ensureOpenAccessPdf(
  userId: string,
  item: ReferenceRecord,
): Promise<ReferenceRecord> {
  if (!item.doi || item.hasPdf) return item;
  if (await referenceHasPdf(userId, item.id)) return item;

  try {
    const file = await downloadOpenAccessPdf(item.doi);
    if (!file) return item;
    await savePdfBufferForReference(userId, item.id, file.buffer, file.fileName);
    return (await getReference(userId, item.id)) ?? item;
  } catch (e) {
    console.warn("[oa-pdf]", e instanceof Error ? e.message : e);
    return item;
  }
}
