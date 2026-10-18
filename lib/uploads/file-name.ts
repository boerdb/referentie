import type { ReferenceRecord } from "@/lib/references/types";

/** "Meyhoff_2022_Restriction of intravenous fluid.pdf", zoals Bookends bijlagen hernoemt. */
export function niceFileName(ref: ReferenceRecord, label?: string | null): string {
  const clean = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const author = clean(ref.authors[0]?.familyName ?? "").replace(/\s+/g, "") || "Onbekend";
  const title = clean(ref.title).split(" ").slice(0, 8).join(" ").slice(0, 80);
  const parts = [author, ref.year ? String(ref.year) : null, title, label ? clean(label) : null];
  return `${parts.filter(Boolean).join("_")}.pdf`;
}

/** Content-Disposition met ASCII-terugval en UTF-8-naam (RFC 6266). */
export function contentDisposition(fileName: string, download: boolean): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
