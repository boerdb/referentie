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
  createdAt: string;
  updatedAt: string;
  authors: { givenName: string; familyName: string }[];
  hasPdf: boolean;
  attachmentId: string | null;
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
};
