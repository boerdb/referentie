import type { ReferenceRecord } from "@/lib/references/types";

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
