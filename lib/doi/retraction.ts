import { getPool } from "@/lib/db/mysql";
import { cleanDoiForLookup } from "./normalize";

/**
 * Teruggetrokken artikelen via Crossref (gegevens van Retraction Watch staan in `updated-by`).
 * Correcties zijn gewoon en tellen niet mee; alleen deze soorten zijn een waarschuwing waard.
 */
export const RETRACTION_TYPES = {
  retraction: "Teruggetrokken",
  withdrawal: "Ingetrokken",
  expression_of_concern: "Expression of concern",
} as const;

export type RetractionType = keyof typeof RETRACTION_TYPES;
export type RetractionInfo = { type: RetractionType; doi: string | null; date: string | null };

const PRIORITY: RetractionType[] = ["retraction", "withdrawal", "expression_of_concern"];

type UpdatedBy = {
  type?: string;
  DOI?: string;
  updated?: { "date-parts"?: number[][] };
};

/** `null` = geen melding; `undefined` = controle mislukt (later opnieuw proberen). */
export async function fetchRetraction(doiRaw: string): Promise<RetractionInfo | null | undefined> {
  const doi = cleanDoiForLookup(doiRaw);
  if (!doi.startsWith("10.")) return null;
  try {
    const res = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=support@clvs.nl`,
      {
        headers: { "User-Agent": "ReferentiePWA/1.0 (mailto:support@clvs.nl)" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    const data = (await res.json()) as { message?: { "updated-by"?: UpdatedBy[] } };
    const notices = (data.message?.["updated-by"] ?? []).filter((u): u is UpdatedBy & { type: RetractionType } =>
      PRIORITY.includes(u.type as RetractionType),
    );
    if (notices.length === 0) return null;
    notices.sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));
    const top = notices[0];
    const parts = top.updated?.["date-parts"]?.[0];
    const date = parts?.length
      ? `${parts[0]}-${String(parts[1] ?? 1).padStart(2, "0")}-${String(parts[2] ?? 1).padStart(2, "0")}`
      : null;
    return { type: top.type, doi: top.DOI ?? null, date };
  } catch {
    return undefined;
  }
}

/** Controleert één artikel en slaat het resultaat op. Fouten worden genegeerd (volgende keer opnieuw). */
export async function checkAndStoreRetraction(referenceId: string, doi: string): Promise<RetractionInfo | null | undefined> {
  const info = await fetchRetraction(doi);
  if (info === undefined) return undefined;
  await getPool().query(
    `UPDATE ref_items SET retraction_type = ?, retraction_doi = ?, retraction_date = ?,
       retraction_checked_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [info?.type ?? null, info?.doi ?? null, info?.date ?? null, referenceId],
  );
  return info;
}
