"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api, type ApiResult } from "@/lib/api/client";
import type { ReferenceCounts, ReferenceRecord, RefStatus } from "@/lib/references/types";

export type ListParams = {
  q: string;
  status: RefStatus | "all";
  starred: boolean;
  hasPdf: boolean;
  trash: boolean;
};

export type Highlight = { id: string; page: number; quote: string | null; color: string };

export const libraryKeys = {
  references: ["references"] as const,
  lists: ["references", "list"] as const,
  list: (params: ListParams) => ["references", "list", params] as const,
  counts: ["references", "counts"] as const,
  highlights: (attachmentId: string) => ["highlights", attachmentId] as const,
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
  if (params.status !== "all") search.set("status", params.status);
  if (params.starred) search.set("starred", "1");
  if (params.hasPdf) search.set("hasPdf", "1");
  if (params.trash) search.set("trash", "1");
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

export type ReferencePatch = Partial<Pick<ReferenceRecord, "starred" | "status">> & {
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
    mutationFn: (input: { attachmentId: string; page: number; quote: string }) =>
      unwrap(
        api("/api/highlights", {
          method: "POST",
          body: { ...input, color: "yellow", rects: [{ x: 0, y: 0, w: 0, h: 0 }] },
        }),
      ),
    onSuccess: (_data, { attachmentId }) =>
      client.invalidateQueries({ queryKey: libraryKeys.highlights(attachmentId) }),
  });
}
