export type RefStatus = "unread" | "reading" | "read";

export type AuthorInput = {
  givenName?: string;
  familyName?: string;
};

export type ReferenceRecord = {
  id: string;
  userId: string;
  type: string;
  title: string;
  abstract: string | null;
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  url: string | null;
  pmid: string | null;
  citeKey: string | null;
  status: RefStatus;
  starred: boolean;
  /** Gezet als de referentie in de prullenbak staat. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authors: { givenName: string; familyName: string }[];
  /** Kleurlabel 1–7 (zie LABELS), of null. */
  label: number | null;
  tags: string[];
  /** Handmatige groepen waar het artikel in zit. */
  groupIds: string[];
  hasPdf: boolean;
  /** Hoofd-PDF. */
  attachmentId: string | null;
  /** Aantal bijlagen (hoofd-PDF plus supplementen). */
  attachmentCount: number;
};

export type ReferenceInput = {
  type?: string;
  title: string;
  abstract?: string | null;
  year?: number | null;
  journal?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  doi?: string | null;
  url?: string | null;
  pmid?: string | null;
  citeKey?: string | null;
  status?: RefStatus;
  starred?: boolean;
  authors?: AuthorInput[];
  label?: number | null;
  /** Vervangt alle trefwoorden; onbekende namen worden aangemaakt. */
  tags?: string[];
};

export type ReferenceCounts = {
  all: number;
  unread: number;
  reading: number;
  read: number;
  starred: number;
  hasPdf: number;
  trash: number;
  duplicates: number;
};

export const LABELS = [
  { id: 1, name: "Rood", color: "#e5484d" },
  { id: 2, name: "Oranje", color: "#f76b15" },
  { id: 3, name: "Geel", color: "#e2b203" },
  { id: 4, name: "Groen", color: "#30a46c" },
  { id: 5, name: "Blauw", color: "#3e63dd" },
  { id: 6, name: "Paars", color: "#8e4ec6" },
  { id: 7, name: "Grijs", color: "#8b8d98" },
] as const;

export type GroupKind = "manual" | "smart";

export type GroupRecord = {
  id: string;
  parentId: string | null;
  name: string;
  kind: GroupKind;
  rules: import("./smart").SmartRules | null;
  position: number;
  count: number;
};

export type TagRecord = { id: string; name: string; count: number };
