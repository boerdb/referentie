/** Versie-informatie, ingevuld bij het bouwen (zie next.config.ts). */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? "";
export const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE ?? "";

export const COPYRIGHT_HOLDER = "Ben de Boer";
/** Eerste jaar van de app; het copyright loopt tot het jaar van de build. */
const FIRST_YEAR = 2026;

export function copyrightLine(): string {
  const year = BUILD_DATE ? new Date(BUILD_DATE).getFullYear() : FIRST_YEAR;
  const years = year > FIRST_YEAR ? `${FIRST_YEAR}–${year}` : String(FIRST_YEAR);
  return `© ${years} ${COPYRIGHT_HOLDER}. Alle rechten voorbehouden.`;
}

export function versionLine(): string {
  const date = BUILD_DATE
    ? new Date(BUILD_DATE).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" })
    : null;
  return ["Referentie", `versie ${APP_VERSION}`, APP_COMMIT && `build ${APP_COMMIT}`, date]
    .filter(Boolean)
    .join(" · ");
}
