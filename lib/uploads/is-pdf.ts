/**
 * Snelle controle op bestandstype, bruikbaar in browser en server.
 * Telefoons sturen soms een lege MIME-type mee; de inhoud (%PDF-) wordt bij het opslaan gecontroleerd.
 */
export function looksLikePdfFile(file: { type: string; name: string }): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf") ||
    file.type === "" ||
    file.type === "application/octet-stream"
  );
}
