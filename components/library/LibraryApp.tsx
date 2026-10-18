"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import type { SessionPayload } from "@/lib/auth/session";
import {
  useEmptyTrash,
  useInvalidateLibrary,
  usePurgeReference,
  useReferenceCounts,
  useReferenceList,
  useRestoreReference,
  useTrashReference,
  type ListParams,
} from "@/lib/library/hooks";
import { flushPendingNotes } from "@/lib/library/note-flush";
import { clearOfflineCache } from "@/lib/pwa/cache";
import type { ReferenceRecord } from "@/lib/references/types";
import { looksLikePdfFile } from "@/lib/uploads/is-pdf";
import { cn } from "@/lib/utils";
import { AddSheet, CommandPalette, DropOverlay, ReferenceForm } from "./dialogs";
import { Inspector } from "./Inspector";
import { useCitationCopy } from "./inspector/useCitationCopy";
import { useExport } from "./inspector/useExport";
import { ReferenceList } from "./ReferenceList";
import { STATUS_LABEL, isDesktop } from "./shared";
import { Sidebar, type LibraryView } from "./Sidebar";

type Props = {
  user: SessionPayload;
};

const DEFAULT_VIEW: LibraryView = { status: "all", starred: false, hasPdf: false, trash: false };

export function LibraryApp({ user }: Props) {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const invalidateLibrary = useInvalidateLibrary();
  const trashMutation = useTrashReference();
  const restoreMutation = useRestoreReference();
  const purgeMutation = usePurgeReference();
  const emptyTrashMutation = useEmptyTrash();
  const citation = useCitationCopy();
  const exporter = useExport();

  const [view, setView] = useState<LibraryView>(DEFAULT_VIEW);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [pdfDropActive, setPdfDropActive] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [doiImporting, setDoiImporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const pdfDropDepth = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const params: ListParams = { ...view, q: debouncedQuery };
  const list = useReferenceList(params);
  const counts = useReferenceCounts();
  const items = list.data ?? [];

  // Zonder expliciete keuze het eerste artikel tonen (zoals voorheen bij laden).
  const selected =
    items.find((i) => i.id === selectedId) ?? (selectedId === null ? (items[0] ?? null) : null);

  const unauthorized = list.error !== null && "status" in list.error && list.error.status === 401;

  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);

  const listTitle = view.trash
    ? "Prullenbak"
    : [
        view.status === "all" ? "Alle artikelen" : STATUS_LABEL[view.status],
        view.starred && "favorieten",
        view.hasPdf && "met PDF",
      ]
        .filter(Boolean)
        .join(" · ");

  function select(id: string) {
    setSelectedId(id);
    setMobilePane("detail");
  }

  function openAdd() {
    if (isDesktop()) setFormOpen(true);
    else setAddSheetOpen(true);
  }

  // Sneltoetsen. Zonder dependency-lijst, zodat de handler altijd de actuele lijst ziet.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/" && !paletteOpen) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "n" && !view.trash) {
        openAdd();
        return;
      }
      if (!selected) return;
      const idx = items.findIndex((i) => i.id === selected.id);
      if (e.key === "j" && idx < items.length - 1) setSelectedId(items[idx + 1].id);
      if (e.key === "k" && idx > 0) setSelectedId(items[idx - 1].id);
      if (e.key === "c") void citation.copyCitation(selected.id, "apa");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Het artikel dat na verwijderen geselecteerd wordt: de volgende, anders de vorige. */
  function neighbourOf(id: string): string | null {
    const idx = items.findIndex((i) => i.id === id);
    return items[idx + 1]?.id ?? items[idx - 1]?.id ?? null;
  }

  function trashReference(reference: ReferenceRecord) {
    const next = neighbourOf(reference.id);
    setSelectedId(next);
    if (!next) setMobilePane("list");
    trashMutation.mutate(reference.id, {
      onError: (error) => {
        setSelectedId(reference.id);
        toast.error("Verwijderen mislukt", error.message);
      },
      onSuccess: () =>
        toast.show({
          kind: "success",
          message: "Naar de prullenbak",
          description: reference.title.slice(0, 80),
          action: { label: "Ongedaan maken", onClick: () => restoreReference(reference, true) },
        }),
    });
  }

  function restoreReference(reference: ReferenceRecord, reselect = false) {
    if (!reselect) setSelectedId(neighbourOf(reference.id));
    restoreMutation.mutate(reference.id, {
      onError: (error) => toast.error("Terugzetten mislukt", error.message),
      onSuccess: () => {
        if (reselect) setSelectedId(reference.id);
        else toast.success("Teruggezet in de bibliotheek");
      },
    });
  }

  async function purgeReference(reference: ReferenceRecord) {
    const ok = await toast.confirm({
      title: "Definitief verwijderen?",
      description: `"${reference.title.slice(0, 80)}${reference.title.length > 80 ? "…" : ""}" en de PDF en notities worden verwijderd. Dit kun je niet ongedaan maken.`,
      confirmLabel: "Definitief verwijderen",
      danger: true,
    });
    if (!ok) return;
    setSelectedId(neighbourOf(reference.id));
    purgeMutation.mutate(reference.id, {
      onError: (error) => toast.error("Verwijderen mislukt", error.message),
      onSuccess: () => toast.success("Definitief verwijderd"),
    });
  }

  async function emptyTrash() {
    const ok = await toast.confirm({
      title: "Prullenbak legen?",
      description: `${items.length} ${items.length === 1 ? "artikel wordt" : "artikelen worden"} definitief verwijderd, met PDF's en notities. Dit kun je niet ongedaan maken.`,
      confirmLabel: "Prullenbak legen",
      danger: true,
    });
    if (!ok) return;
    setSelectedId(null);
    emptyTrashMutation.mutate(undefined, {
      onError: (error) => toast.error("Legen mislukt", error.message),
      onSuccess: (deleted) =>
        toast.success(`${deleted} ${deleted === 1 ? "artikel" : "artikelen"} definitief verwijderd`),
    });
  }

  async function importDoi(doi: string) {
    if (doiImporting) return;
    setDoiImporting(true);
    const res = await api<{ item?: ReferenceRecord; existing?: boolean; restored?: boolean }>(
      "/api/doi",
      { method: "POST", body: { doi, save: true } },
    );
    setDoiImporting(false);
    if (!res.ok) {
      toast.error("DOI ophalen mislukt", res.error);
      return;
    }
    setPaletteOpen(false);
    await invalidateLibrary();
    const item = res.data.item;
    if (!item) return;
    if (view.trash) setView(DEFAULT_VIEW);
    select(item.id);
    if (res.data.restored) toast.success("Teruggezet uit de prullenbak", item.title.slice(0, 80));
    else if (res.data.existing) toast.info("Staat al in je bibliotheek", item.title.slice(0, 80));
    else
      toast.success(
        "Artikel toegevoegd",
        item.hasPdf ? "Er is een open PDF gevonden en gekoppeld." : undefined,
      );
  }

  async function importPdfs(files: File[]) {
    for (const file of files) {
      if (!looksLikePdfFile(file)) {
        toast.error("Alleen PDF-bestanden", file.name);
        continue;
      }
      setPdfImporting(true);
      const fd = new FormData();
      fd.set("file", file);
      const res = await api<{ item?: ReferenceRecord; message?: string }>(
        "/api/references/from-pdf",
        { method: "POST", body: fd },
      );
      setPdfImporting(false);
      if (!res.ok) {
        toast.error("Import mislukt", `${file.name}: ${res.error}`);
        continue;
      }
      await invalidateLibrary();
      if (res.data.item) {
        if (view.trash) setView(DEFAULT_VIEW);
        select(res.data.item.id);
      }
      if (res.data.message) toast.success(res.data.message, file.name);
    }
  }

  function onPdfDragEnter(e: React.DragEvent) {
    e.preventDefault();
    pdfDropDepth.current += 1;
    if (e.dataTransfer.types.includes("Files")) setPdfDropActive(true);
  }

  function onPdfDragLeave(e: React.DragEvent) {
    e.preventDefault();
    pdfDropDepth.current -= 1;
    if (pdfDropDepth.current <= 0) {
      pdfDropDepth.current = 0;
      setPdfDropActive(false);
    }
  }

  function onPdfDrop(e: React.DragEvent) {
    e.preventDefault();
    pdfDropDepth.current = 0;
    setPdfDropActive(false);
    const files = [...e.dataTransfer.files].filter(looksLikePdfFile);
    if (files.length === 0) {
      toast.info("Sleep een PDF-bestand");
      return;
    }
    void importPdfs(files);
  }

  async function logout() {
    await flushPendingNotes();
    await api("/api/auth/logout", { method: "POST" });
    await clearOfflineCache();
    queryClient.clear();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell flex h-dvh flex-col overflow-hidden">
      <input
        ref={importFileRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 0) void importPdfs(files);
        }}
      />
      <div
        className="relative flex min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-clip overflow-y-hidden"
        onDragEnter={onPdfDragEnter}
        onDragLeave={onPdfDragLeave}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={onPdfDrop}
      >
        {mobileMenuOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: "var(--overlay)" }}
            aria-label="Menu sluiten"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <div
          className={cn(
            "z-50 hidden lg:flex",
            mobileMenuOpen &&
              "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:!flex max-lg:w-[min(18.5rem,86vw)] max-lg:pt-[env(safe-area-inset-top,0px)] max-lg:pb-[env(safe-area-inset-bottom,0px)]",
          )}
        >
          <Sidebar
            user={user}
            view={view}
            counts={counts.data}
            onViewChange={(next) => {
              setView(next);
              setSelectedId(null);
            }}
            onClose={() => setMobileMenuOpen(false)}
            onUploadPdf={() => importFileRef.current?.click()}
            onOpenPalette={() => setPaletteOpen(true)}
            onLogout={() => void logout()}
          />
        </div>
        <ReferenceList
          title={listTitle}
          items={items}
          loading={list.isPending || (list.isFetching && list.isPlaceholderData)}
          error={list.error && !unauthorized ? list.error.message : null}
          filtered={Boolean(debouncedQuery) || view.status !== "all" || view.starred || view.hasPdf}
          trash={view.trash}
          selectedId={selected?.id ?? null}
          hidden={mobilePane === "detail"}
          query={query}
          searchRef={searchRef}
          onQueryChange={setQuery}
          onSelect={select}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          onAdd={openAdd}
          onUploadPdf={() => importFileRef.current?.click()}
          onManual={() => setFormOpen(true)}
          onEmptyTrash={() => void emptyTrash()}
        />
        <Inspector
          reference={selected}
          hidden={mobilePane === "list"}
          onBack={() => setMobilePane("list")}
          onSelect={select}
          onLibraryChanged={() => void invalidateLibrary()}
          onTrash={trashReference}
          onRestore={(reference) => restoreReference(reference)}
          onPurge={(reference) => void purgeReference(reference)}
          citation={citation}
          exporter={exporter}
        />
        {(pdfDropActive || pdfImporting) && <DropOverlay importing={pdfImporting} />}
      </div>

      {paletteOpen && (
        <CommandPalette
          selected={selected}
          importing={doiImporting}
          onClose={() => setPaletteOpen(false)}
          onImportDoi={(doi) => void importDoi(doi)}
          onNew={() => setFormOpen(true)}
          onCopyApa={() => {
            if (selected) void citation.copyCitation(selected.id, "apa");
          }}
          onExport={(mode) => {
            if (selected) void exporter.exportReference(selected, mode);
          }}
        />
      )}
      {addSheetOpen && (
        <AddSheet
          onClose={() => setAddSheetOpen(false)}
          onUploadPdf={() => importFileRef.current?.click()}
          onDoi={() => setPaletteOpen(true)}
          onManual={() => setFormOpen(true)}
        />
      )}
      {formOpen && (
        <ReferenceForm
          onClose={() => setFormOpen(false)}
          onCreated={(item) => {
            setFormOpen(false);
            void invalidateLibrary();
            if (view.trash) setView(DEFAULT_VIEW);
            select(item.id);
          }}
        />
      )}
    </div>
  );
}
