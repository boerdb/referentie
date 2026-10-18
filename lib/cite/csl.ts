import { readFileSync } from "fs";
import path from "path";
import CSL from "citeproc";
import type { ReferenceRecord } from "@/lib/references/types";
import { CSL_STYLES, type CslStyleId } from "./styles";

/**
 * Opmaak volgens CSL-stijlen (citeproc-js), zoals Zotero en Bookends dat doen.
 * Stijlen en locales staan in lib/cite/csl/ (citation-style-language/styles, CC BY-SA 3.0).
 */
const CSL_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "lib", "cite", "csl");

const cache = new Map<string, string>();

function readCslFile(name: string): string {
  let xml = cache.get(name);
  if (!xml) {
    xml = readFileSync(/* turbopackIgnore: true */ path.join(CSL_DIR, name), "utf8");
    cache.set(name, xml);
  }
  return xml;
}

const CSL_TYPE: Record<string, string> = {
  article: "article-journal",
  book: "book",
  chapter: "chapter",
  conference: "paper-conference",
  thesis: "thesis",
  report: "report",
  web: "webpage",
};

type CslItem = Record<string, unknown> & { id: string };

/** Artikel als CSL-JSON. */
export function toCslItem(ref: ReferenceRecord): CslItem {
  const item: CslItem = {
    id: ref.id,
    type: CSL_TYPE[ref.type] ?? "article-journal",
    title: ref.title,
    author: ref.authors
      .filter((a) => a.familyName || a.givenName)
      .map((a) => (a.familyName ? { family: a.familyName, given: a.givenName } : { literal: a.givenName })),
  };
  if (ref.year) item.issued = { "date-parts": [[ref.year]] };
  if (ref.journal) item["container-title"] = ref.journal;
  if (ref.volume) item.volume = ref.volume;
  if (ref.issue) item.issue = ref.issue;
  if (ref.pages) item.page = ref.pages;
  if (ref.doi) item.DOI = ref.doi;
  if (ref.url) item.URL = ref.url;
  if (ref.pmid) item.PMID = ref.pmid;
  if (ref.abstract) item.abstract = ref.abstract;
  return item;
}

export type Bibliography = {
  /** Eén regel per artikel, in de volgorde van de stijl. */
  entries: string[];
  /** Hele bibliografie als platte tekst. */
  text: string;
  /** Hele bibliografie als HTML (cursief, nummering), om opgemaakt te plakken. */
  html: string;
};

function render(refs: ReferenceRecord[], styleId: CslStyleId, format: "text" | "html", locale: string) {
  const items = new Map(refs.map((r) => [r.id, toCslItem(r)]));
  const engine = new CSL.Engine(
    {
      retrieveLocale: (lang: string) => {
        try {
          return readCslFile(`locales-${lang}.xml`);
        } catch {
          return readCslFile("locales-en-US.xml");
        }
      },
      retrieveItem: (id: string) => items.get(id),
    },
    readCslFile(CSL_STYLES[styleId].file),
    locale,
    true,
  );
  engine.setOutputFormat(format);
  // Volgorde zoals gekozen; nummerstijlen (Vancouver, AMA) nummeren in deze volgorde.
  engine.updateItems(refs.map((r) => r.id));
  const result = engine.makeBibliography() as [unknown, string[]] | false;
  // Sommige stijlen (NEJM) zetten dubbele spaties na het nummer.
  return result ? result[1].map((s) => (format === "text" ? s.replace(/\s+/g, " ") : s).trim()) : [];
}

export function formatBibliography(
  refs: ReferenceRecord[],
  styleId: CslStyleId,
  locale = "en-US",
): Bibliography {
  if (refs.length === 0) return { entries: [], text: "", html: "" };
  const entries = render(refs, styleId, "text", locale);
  const htmlEntries = render(refs, styleId, "html", locale);
  return {
    entries,
    text: entries.join("\n"),
    html: htmlEntries.join("\n"),
  };
}

/** Losse bronvermelding zonder het volgnummer van nummerstijlen ("1. "). */
export function stripNumber(text: string): string {
  return text.replace(/^\[?\d+\]?\.?\s+/, "");
}
