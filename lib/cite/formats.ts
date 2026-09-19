import type { ReferenceRecord } from "@/lib/references/types";

export type CiteStyle = "apa" | "mla" | "chicago";

function formatAuthorsApa(
  authors: ReferenceRecord["authors"],
  max = 20,
): string {
  if (!authors.length) return "";
  const parts = authors.slice(0, max).map((a) => {
    const initial = a.givenName
      ? `${a.givenName.trim().charAt(0).toUpperCase()}.`
      : "";
    return `${a.familyName}${initial ? `, ${initial}` : ""}`.trim();
  });
  if (authors.length > max) parts.push("…");
  return parts.join(", ");
}

function formatAuthorsMla(authors: ReferenceRecord["authors"]): string {
  if (!authors.length) return "";
  if (authors.length === 1) {
    const a = authors[0];
    return `${a.familyName}, ${a.givenName}`.trim();
  }
  const first = authors[0];
  const rest = authors
    .slice(1)
    .map((a) => `${a.givenName} ${a.familyName}`.trim())
    .join(", ");
  return `${first.familyName}, ${first.givenName}, et al. ${rest}`.replace(
    /, et al\. .*/,
    ", et al.",
  );
}

function formatAuthorsChicago(authors: ReferenceRecord["authors"]): string {
  if (!authors.length) return "";
  if (authors.length === 1) {
    const a = authors[0];
    return `${a.familyName}, ${a.givenName}`.trim();
  }
  if (authors.length === 2) {
    const [a, b] = authors;
    return `${a.familyName}, ${a.givenName}, and ${b.givenName} ${b.familyName}`;
  }
  const first = authors[0];
  return `${first.familyName}, ${first.givenName}, et al.`;
}

export function formatCitation(
  ref: ReferenceRecord,
  style: CiteStyle,
): string {
  const year = ref.year ?? "n.d.";
  const title = ref.title;
  const journal = ref.journal ?? "";
  const vol = ref.volume ?? "";
  const issue = ref.issue ? `(${ref.issue})` : "";
  const pages = ref.pages ? `, ${ref.pages}` : "";
  const doi = ref.doi ? ` https://doi.org/${ref.doi}` : "";

  if (style === "apa") {
    const authors = formatAuthorsApa(ref.authors);
    const authorPart = authors ? `${authors} ` : "";
    const journalPart = journal
      ? ` *${journal}*${vol ? `, *${vol}*` : ""}${issue}${pages}.`
      : ".";
    return `${authorPart}(${year}). ${title}.${journalPart}${doi}`.trim();
  }

  if (style === "mla") {
    const authors = formatAuthorsMla(ref.authors);
    const authorPart = authors ? `${authors}. ` : "";
    const journalPart = journal
      ? ` *${journal}*${vol ? `, vol. ${vol}` : ""}${ref.issue ? `, no. ${ref.issue}` : ""}${pages}.`
      : "";
    return `${authorPart}"${title}."${journalPart} ${year}.${doi}`.trim();
  }

  const authors = formatAuthorsChicago(ref.authors);
  const authorPart = authors ? `${authors}. ` : "";
  const journalPart = journal
    ? ` "${title}." *${journal}* ${vol}${ref.issue ? `, no. ${ref.issue}` : ""}${pages} (${year}).`
    : ` "${title}." (${year}).`;
  return `${authorPart}${journalPart}${doi}`.trim();
}

function bibtexKey(ref: ReferenceRecord): string {
  if (ref.citeKey?.trim()) return ref.citeKey.trim().replace(/\s+/g, "");
  const family = ref.authors[0]?.familyName?.replace(/[^\w]/g, "") || "ref";
  const year = ref.year ?? "nd";
  return `${family}${year}`.slice(0, 40);
}

function escapeBibtex(value: string): string {
  return value.replace(/[{}\\]/g, "\\$&");
}

/** BibTeX-export voor import in Zotero/Mendeley/etc. */
export function formatBibtex(ref: ReferenceRecord): string {
  const authors = ref.authors
    .map((a) => `${a.familyName}, ${a.givenName}`.trim().replace(/,\s*$/, ""))
    .filter(Boolean)
    .join(" and ");
  const lines = [
    `@article{${bibtexKey(ref)},`,
    `  title = {${escapeBibtex(ref.title)}},`,
  ];
  if (authors) lines.push(`  author = {${escapeBibtex(authors)}},`);
  if (ref.journal) lines.push(`  journal = {${escapeBibtex(ref.journal)}},`);
  if (ref.year) lines.push(`  year = {${ref.year}},`);
  if (ref.volume) lines.push(`  volume = {${escapeBibtex(ref.volume)}},`);
  if (ref.issue) lines.push(`  number = {${escapeBibtex(ref.issue)}},`);
  if (ref.pages) lines.push(`  pages = {${escapeBibtex(ref.pages)}},`);
  if (ref.doi) lines.push(`  doi = {${escapeBibtex(ref.doi)}},`);
  if (ref.url) lines.push(`  url = {${escapeBibtex(ref.url)}},`);
  lines.push("}");
  return lines.join("\n");
}

/** Korte samenvatting voor delen via WhatsApp/iOS share-sheet. */
export function formatShareSummary(ref: ReferenceRecord): string {
  const authors = ref.authors
    .map((a) => `${a.givenName} ${a.familyName}`.trim())
    .filter(Boolean)
    .join(", ");
  const parts = [ref.title];
  if (authors) parts.push(authors);
  if (ref.journal || ref.year) {
    parts.push([ref.journal, ref.year].filter(Boolean).join(", "));
  }
  if (ref.doi) parts.push(`https://doi.org/${ref.doi}`);
  return parts.join("\n");
}
