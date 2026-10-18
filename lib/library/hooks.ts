"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api, type ApiResult } from "@/lib/api/client";
import type { SmartRules } from "@/lib/references/smart";
import type {
  GroupRecord,
  ReferenceCounts,
  ReferenceRecord,
  RefStatus,
  TagRecord,
} from "@/lib/references/types";

export type SearchField = "all" | "title" | "author" | "journal" | "doi" | "fulltext";

export type ListParams = {
  q: string;
  field: SearchField;
  status: RefStatus | "all";
  starred: boolean;
  hasPdf: boolean;
  trash: boolean;
  /** Handmatige of slimme groep. */
  group: string | null;
  tag: string | null;
  label: number | null;
  duplicates: boolean;
};

/** Rechthoek als fractie van de pagina (0–1), zodat hij bij elk zoomniveau klopt. */
export type HighlightRect = { x: number; y: number; w: number; h: number };

export type Highlight = {
  id: string;
  page: number;
  quote: string | null;
  color: string;
  rects: HighlightRect[];
  note: string | null;
};

export type Attachment = {
  id: string;
  name: string;
  label: string | null;
  sizeBytes: number;
  pageCount: number | null;
  position: number;
  createdAt: string;
  indexed: boolean;
};

export const libraryKeys = {
  references: ["references"] as const,
  lists: ["references", "list"] as const,
  list: (params: ListParams) => ["references", "list", params] as const,
  counts: ["references", "counts"] as const,
  groups: ["references", "groups"] as const,
  tags: ["references", "tags"] as const,
  duplicates: ["references", "duplicates"] as const,
  highlights: (attachmentId: string) => ["highlights", attachmentId] as const,
  attachments: (referenceId: string) => ["references", "attachments", referenceId] as const,
};

/** Fout uit de API, met HTTP-status (0 = geen verbinding). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function unwrap<T>(result: Promise<ApiResult<T>>): Promise<T> {
  const res = await result;
  if (!res.ok) throw new ApiError(res.error, res.status);
  return res.data;
}

function listUrl(params: ListParams): string {
  const search = new URLSearchParams();
  if (params.q.trim()) search.set("q", params.q.trim());
  if (params.q.trim() && params.field !== "all") search.set("in", params.field);
  if (params.status !== "all") search.set("status", params.status);
  if (params.starred) search.set("starred", "1");
  if (params.hasPdf) search.set("hasPdf", "1");
  if (params.trash) search.set("trash", "1");
  if (params.group) search.set("group", params.group);
  if (params.tag) search.set("tag", params.tag);
  if (params.label) search.set("label", String(params.label));
  if (params.duplicates) search.set("duplicates", "1");
  return `/api/references?${search}`;
}

export function useReferenceList(params: ListParams) {
  return useQuery({
    queryKey: libraryKeys.list(params),
    queryFn: () =>
      unwrap(api<{ items?: ReferenceRecord[] }>(listUrl(params))).then((d) => d.items ?? []),
    // Bij een nieuwe zoekterm de vorige lijst laten staan tot het antwoord er is.
    placeholderData: keepPreviousData,
  });
}

export function useReferenceCounts() {
  return useQuery({
    queryKey: libraryKeys.counts,
    queryFn: () =>
      unwrap(api<{ counts: ReferenceCounts }>("/api/references/counts")).then((d) => d.counts),
  });
}

export function useHighlights(attachmentId: string | null) {
  return useQuery({
    queryKey: libraryKeys.highlights(attachmentId ?? ""),
    queryFn: () =>
      unwrap(
        api<{ items?: Highlight[] }>(
          `/api/highlights?attachmentId=${encodeURIComponent(attachmentId ?? "")}`,
        ),
      ).then((d) => d.items ?? []),
    enabled: Boolean(attachmentId),
  });
}

type ListSnapshot = [readonly unknown[], ReferenceRecord[] | undefined][];

/** Past elke geladen lijst aan; geeft de oude stand terug om bij een fout te herstellen. */
function updateLists(
  client: QueryClient,
  fn: (list: ReferenceRecord[]) => ReferenceRecord[],
): ListSnapshot {
  const snapshot = client.getQueriesData<ReferenceRecord[]>({ queryKey: libraryKeys.lists });
  client.setQueriesData<ReferenceRecord[]>({ queryKey: libraryKeys.lists }, (list) =>
    list ? fn(list) : list,
  );
  return snapshot;
}

function restoreLists(client: QueryClient, snapshot: ListSnapshot | undefined) {
  for (const [key, data] of snapshot ?? []) client.setQueryData(key, data);
}

/** Zet een bijgewerkt artikel in alle geladen lijsten, zonder opnieuw op te halen. */
export function useReplaceReference() {
  const client = useQueryClient();
  return (item: ReferenceRecord) => {
    updateLists(client, (list) => list.map((i) => (i.id === item.id ? item : i)));
  };
}

/** Lijsten en aantallen opnieuw ophalen, bijv. na een import. */
export function useInvalidateLibrary() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: libraryKeys.references });
}

export type ReferencePatch = Partial<Pick<ReferenceRecord, "starred" | "status" | "label" | "tags">> & {
  doi?: string | null;
};

/** Optimistisch bijwerken: direct tonen, bij een fout terugzetten. */
export function usePatchReference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ReferencePatch }) =>
      unwrap(
        api<{ item: ReferenceRecord }>(`/api/references/${id}`, { method: "PATCH", body: patch }),
      ).then((d) => d.item),
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: libraryKeys.lists });
      return updateLists(client, (list) =>
        list.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      );
    },
    onError: (_error, _vars, snapshot) => restoreLists(client, snapshot),
    onSuccess: (item) => {
      updateLists(client, (list) => list.map((i) => (i.id === item.id ? item : i)));
    },
    // Status en favoriet bepalen in welke gefilterde lijsten een artikel hoort.
    onSettled: () => client.invalidateQueries({ queryKey: libraryKeys.references }),
  });
}

/** Naar de prullenbak; verdwijnt direct uit de lijst. */
export function useTrashReference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api(`/api/references/${id}`, { method: "DELETE" })),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: libraryKeys.lists });
      return updateLists(client, (list) => list.filter((i) => i.id !== id));
    },
    onError: (_error, _id, snapshot) => restoreLists(client, snapshot),
    onSettled: () => client.invalidateQueries({ queryKey: libraryKeys.references }),
  });
}

export function useRestoreReference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api<{ item: ReferenceRecord }>(`/api/references/${id}/restore`, { method: "POST" }),
      ).then((d) => d.item),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: libraryKeys.lists });
      // Alleen uit de prullenbaklijst halen; de gewone lijsten worden opnieuw opgehaald.
      return updateLists(client, (list) =>
        list.filter((i) => i.id !== id || i.deletedAt === null),
      );
    },
    onError: (_error, _id, snapshot) => restoreLists(client, snapshot),
    onSettled: () => client.invalidateQueries({ queryKey: libraryKeys.references }),
  });
}

export function usePurgeReference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api(`/api/references/${id}?permanent=1`, { method: "DELETE" })),
    onSuccess: (_data, id) => {
      updateLists(client, (list) => list.filter((i) => i.id !== id));
    },
    onSettled: () => client.invalidateQueries({ queryKey: libraryKeys.counts }),
  });
}

export function useEmptyTrash() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api<{ deleted: number }>("/api/trash", { method: "DELETE" })).then((d) => d.deleted),
    onSettled: () => client.invalidateQueries({ queryKey: libraryKeys.references }),
  });
}

export function useAddHighlight() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      attachmentId: string;
      page: number;
      quote: string;
      rects?: HighlightRect[];
      color?: string;
    }) =>
      unwrap(
        api<{ id: string }>("/api/highlights", {
          method: "POST",
          body: { color: "yellow", rects: [{ x: 0, y: 0, w: 0, h: 0 }], ...input },
        }),
      ),
    onSuccess: (_data, { attachmentId }) =>
      client.invalidateQueries({ queryKey: libraryKeys.highlights(attachmentId) }),
  });
}

export function useHighlightActions(attachmentId: string | null) {
  const client = useQueryClient();
  const settle = () =>
    attachmentId && client.invalidateQueries({ queryKey: libraryKeys.highlights(attachmentId) });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api(`/api/highlights/${id}`, { method: "DELETE" })),
    onMutate: async (id) => {
      if (!attachmentId) return;
      // Direct uit beeld halen.
      client.setQueryData<Highlight[]>(libraryKeys.highlights(attachmentId), (list) =>
        list?.filter((h) => h.id !== id),
      );
    },
    onSettled: settle,
  });
  const recolor = useMutation({
    mutationFn: ({ id, color }: { id: string; color: string }) =>
      unwrap(api(`/api/highlights/${id}`, { method: "PATCH", body: { color } })),
    onSettled: settle,
  });
  return { remove, recolor };
}

export function useAttachments(referenceId: string | null) {
  return useQuery({
    queryKey: libraryKeys.attachments(referenceId ?? ""),
    queryFn: () =>
      unwrap(api<{ items: Attachment[] }>(`/api/references/${referenceId}/attachments`)).then(
        (d) => d.items,
      ),
    enabled: Boolean(referenceId),
  });
}

/** Bijlagen toevoegen, hernoemen, als hoofd-PDF instellen en verwijderen. */
export function useAttachmentActions(referenceId: string) {
  const client = useQueryClient();
  const settle = () => client.invalidateQueries({ queryKey: libraryKeys.references });
  const add = useMutation({
    mutationFn: ({ file, label }: { file: File; label?: string }) => {
      const fd = new FormData();
      fd.set("file", file);
      if (label) fd.set("label", label);
      return unwrap(
        api<{ attachmentId: string }>(`/api/references/${referenceId}/attachments`, {
          method: "POST",
          body: fd,
        }),
      );
    },
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: { id: string; label?: string | null; makePrimary?: boolean }) =>
      unwrap(api(`/api/attachments/${id}`, { method: "PATCH", body: input })),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api(`/api/attachments/${id}`, { method: "DELETE" })),
    onSettled: settle,
  });
  return { add, update, remove };
}

export type BulkAction =
  | { action: "update"; patch: Partial<Pick<ReferenceRecord, "starred" | "status" | "label">> }
  | { action: "tag"; tag: string; remove?: boolean }
  | { action: "group"; groupId: string; remove?: boolean }
  | { action: "trash" }
  | { action: "restore" }
  | { action: "purge" };

/** Eén actie op een selectie. Verwijderen en terugzetten halen de artikelen direct uit de lijst. */
export function useBulkAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, ...rest }: BulkAction & { ids: string[] }) =>
      unwrap(
        api<{ done: number }>("/api/references/bulk", { method: "POST", body: { ids, ...rest } }),
      ).then((d) => d.done),
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: libraryKeys.lists });
      const ids = new Set(vars.ids);
      if (vars.action === "update") {
        return updateLists(client, (list) =>
          list.map((i) => (ids.has(i.id) ? { ...i, ...vars.patch } : i)),
        );
      }
      // Trefwoord en groep: de lijst wordt na afloop opnieuw opgehaald.
      if (vars.action === "tag" || vars.action === "group") return undefined;
      return updateLists(client, (list) => list.filter((i) => !ids.has(i.id)));
    },
    onError: (_error, _vars, snapshot) => restoreLists(client, snapshot),
    onSettled: () => client.invalidateQueries({ queryKey: libraryKeys.references }),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: libraryKeys.groups,
    queryFn: () => unwrap(api<{ groups: GroupRecord[] }>("/api/groups")).then((d) => d.groups),
  });
}

export function useTags() {
  return useQuery({
    queryKey: libraryKeys.tags,
    queryFn: () => unwrap(api<{ tags: TagRecord[] }>("/api/tags")).then((d) => d.tags),
  });
}

export function useDuplicateSets(enabled: boolean) {
  return useQuery({
    queryKey: libraryKeys.duplicates,
    queryFn: () => unwrap(api<{ sets: string[][] }>("/api/duplicates")).then((d) => d.sets),
    enabled,
  });
}

/** Groepen en trefwoorden aanmaken, wijzigen en verwijderen; daarna alles opnieuw ophalen. */
export function useOrganize() {
  const client = useQueryClient();
  const settle = () => client.invalidateQueries({ queryKey: libraryKeys.references });
  const createGroup = useMutation({
    mutationFn: (input: { name: string; kind: "manual" | "smart"; parentId?: string | null; rules?: SmartRules }) =>
      unwrap(api<{ id: string }>("/api/groups", { method: "POST", body: input })).then((d) => d.id),
    onSettled: settle,
  });
  const updateGroup = useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; parentId?: string | null; rules?: SmartRules }) =>
      unwrap(api(`/api/groups/${id}`, { method: "PATCH", body: input })),
    onSettled: settle,
  });
  const deleteGroup = useMutation({
    mutationFn: (id: string) => unwrap(api(`/api/groups/${id}`, { method: "DELETE" })),
    onSettled: settle,
  });
  const renameTag = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      unwrap(api(`/api/tags/${id}`, { method: "PATCH", body: { name } })),
    onSettled: settle,
  });
  const deleteTag = useMutation({
    mutationFn: (id: string) => unwrap(api(`/api/tags/${id}`, { method: "DELETE" })),
    onSettled: settle,
  });
  const merge = useMutation({
    mutationFn: (input: { keepId: string; mergeIds: string[] }) =>
      unwrap(api<{ item: ReferenceRecord }>("/api/duplicates", { method: "POST", body: input })).then(
        (d) => d.item,
      ),
    onSettled: settle,
  });
  return { createGroup, updateGroup, deleteGroup, renameTag, deleteTag, merge };
}
