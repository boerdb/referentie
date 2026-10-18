// Minimale typen voor citeproc-js (het pakket levert er geen mee).
declare module "citeproc" {
  type Sys = {
    retrieveLocale: (lang: string) => string;
    retrieveItem: (id: string) => unknown;
  };
  interface Engine {
    setOutputFormat(format: "text" | "html" | "rtf"): void;
    updateItems(ids: string[]): void;
    makeBibliography(): [unknown, string[]] | false;
  }
  const CSL: {
    Engine: new (sys: Sys, style: string, lang?: string, forceLang?: boolean) => Engine;
  };
  export default CSL;
}
