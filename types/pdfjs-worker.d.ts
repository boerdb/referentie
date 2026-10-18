// De worker van pdf.js heeft geen eigen typen; we gebruiken hem alleen als module om vooraf te laden.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
