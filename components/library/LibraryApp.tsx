"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import type { SessionPayload } from "@/lib/auth/session";
import { formatBibtex } from "@/lib/cite/formats";
import {
  useBulkAction,
  useEmptyTrash,
  useInvalidateLibrary,
  usePurgeReference,
  useReferenceCounts,
  useReferenceList,
  useRestoreReference,
  useTrashReference,
  type BulkAction,
  type ListParams,
  type SearchField,
} from "@/lib/library/hooks";
import { flushPendingNotes } from "@/lib/library/note-flush";
import { usePref } from "@/lib/library/prefs";
import { clearOfflineCache } from "@/lib/pwa/cache";
import type { ReferenceRecord } from "@/lib/references/types";
import { shareOrCopyText } from "@/lib/share/files";
import { looksLikePdfFile } from "@/lib/uploads/is-pdf";
import { cn } from "@/lib/utils";
import { AddSheet, CommandPalette, DropOverlay, ReferenceForm } from "./dialogs";
import { Inspector, type BulkRequest } from "./Inspector";
import { useCitationCopy } from "./inspector/useCitationCopy";
import { useExport } from "./inspector/useExport";
import { PdfViewer } from "./PdfViewer";
import { ReferenceList } from "./ReferenceList";
import {
  DEFAULT_COLUMNS,
  ReferenceTable,
  sortReferences,
  type ColumnId,
  type Density,
  type SortState,
} from "./ReferenceTable";
import { STATUS_LABEL, isDesktop } from "./shared";
import { Sidebar, type LibraryView } from "./Sidebar";
import { StatusBar, Toolbar, type ListMode } from "./Toolbar";

type Props = {
  user: SessionPayload;
};

const DEFAULT_VIEW: LibraryView = { status: "all", starred: false, hasPdf: false, trash: false };
const INSPECTOR_DEFAULT = 400;
const INSPECTOR_MIN = 320;
const INSPECTOR_MAX = 760;

type Selection = { ids: Set<string>; primary: string | null; anchor: string | null };
const NO_WIDTHS: Partial<Record<ColumnId, number>> = {};
const NO_SELECTION: Selection = { ids: new Set(), primary: null, anchor: null };

export function LibraryApp({ user }: Props) {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const invalidateLibrary = useInvalidateLibrary();
  const trashMutation = useTrashReference();
  const restoreMutation = useRestoreReference();
  const purgeMutation = usePurgeReference();
  const emptyTrashMutation = useEmptyTrash();
  const bulkMutation = useBulkAction();
  const citation = useCitationCopy();
  const exporter = useExport();

  // Weergavevoorkeuren (per browser onthouden)
  const [listMode, setListMode] = usePref<ListMode>("listMode", "table");
  const [sidebarOpen, setSidebarOpen] = usePref("sidebarOpen", true);
  const [inspectorOpen, setInspectorOpen] = usePref("inspectorOpen", true);
  const [inspectorWidth, setInspectorWidth] = usePref("inspectorWidth", INSPECTOR_DEFAULT);
  const [columns, setColumns] = usePref<ColumnId[]>("columns", DEFAULT_COLUMNS);
  const [widths, setWidths] = usePref<Partial<Record<ColumnId, number>>>("columnWidths", NO_WIDTHS);
  const [sort, setSort] = usePref<SortState>("sort", null);
  const [density, setDensity] = usePref<Density>("density", "compact");
  const [field, setField] = usePref<SearchField>("searchField", "all");

  const [view, setView] = useState<LibraryView>(DEFAULT_VIEW);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [draftInspectorWidth, setDraftInspectorWidth] = useState<number | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [pdfDropActive, setPdfDropActive] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [doiImporting, setDoiImporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const pdfDropDepth = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const params: ListParams = { ...view, q: debouncedQuery, field };
  const list = useReferenceList(params);
  const counts = useReferenceCounts();
  const items = useMemo(() => sortReferences(list.data ?? [], sort), [list.data, sort]);

  // Zonder expliciete keuze het eerste artikel tonen.
  const primary =
    items.find((i) => i.id === selection.primary) ??
    (selection.primary === null ? (items[0] ?? null) : null);
  const selectedItems = items.filter((i) => selection.ids.has(i.id));
  const selectedIds = selection.ids.size > 0 ? selection.ids : new Set(primary ? [primary.id] : []);
  const multiSelection = selectedItems.length > 1 ? selectedItems : [];
  const showPdf = pdfOpen && Boolean(primary?.hasPdf) && multiSelection.length === 0;

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

  /** Eén artikel selecteren (en op de telefoon openen). */
  function select(id: string | null) {
    setSelection(id ? { ids: new Set([id]), primary: id, anchor: id } : NO_SELECTION);
    if (id) setMobilePane("detail");
  }

  function clickRow(id: string, mods: { range: boolean; toggle: boolean }) {
    if (mods.range) {
      const anchor = selection.anchor ?? primary?.id ?? id;
      const a = items.findIndex((i) => i.id === anchor);
      const b = items.findIndex((i) => i.id === id);
      const [from, to] = a < b ? [a, b] : [b, a];
      setSelection({
        ids: new Set(items.slice(from, to + 1).map((i) => i.id)),
        primary: id,
        anchor,
      });
    } else if (mods.toggle) {
      const ids = new Set(selectedIds);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      const nextPrimary = ids.has(id) ? id : ([...ids][0] ?? null);
      setSelection({ ids, primary: nextPrimary, anchor: id });
    } else {
      select(id);
    }
  }

  function moveSelection(delta: number, extend: boolean) {
    if (items.length === 0) return;
    const idx = primary ? items.findIndex((i) => i.id === primary.id) : -1;
    const next = items[Math.max(0, Math.min(items.length - 1, idx + delta))];
    if (!next) return;
    if (extend) clickRow(next.id, { range: true, toggle: false });
    else setSelection({ ids: new Set([next.id]), primary: next.id, anchor: next.id });
  }

  function changeView(next: LibraryView) {
    setView(next);
    setSelection(NO_SELECTION);
    setPdfOpen(false);
  }

  function openAdd() {
    if (isDesktop()) setFormOpen(true);
    else setAddSheetOpen(true);
  }

  // Globale sneltoetsen. Zonder dependency-lijst, zodat de handler altijd de actuele lijst ziet.
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
      if (e.key === "Escape" && pdfOpen && !paletteOpen && !formOpen) {
        setPdfOpen(false);
        return;
      }
      if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
      // De tabel handelt zijn eigen pijltjes, spatie en Delete af.
      if (e.target instanceof HTMLElement && e.target.closest("[data-table]")) return;
      if (e.key === "/" && !paletteOpen) {
        e.preventDefault();
        (isDesktop() ? searchRef : mobileSearchRef).current?.focus();
        return;
      }
      if (e.key === "n" && !view.trash) {
        openAdd();
        return;
      }
      if (e.key === "j") moveSelection(1, false);
      if (e.key === "k") moveSelection(-1, false);
      if (e.key === " " && primary?.hasPdf && isDesktop()) {
        e.preventDefault();
        setPdfOpen((v) => !v);
      }
      if (e.key === "c" && primary) void citation.copyCitation(primary.id, "apa");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onTableKey(e: React.KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      moveSelection(1, e.shiftKey);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      moveSelection(-1, e.shiftKey);
    } else if (e.key === "Home") {
      e.preventDefault();
      moveSelection(-items.length, e.shiftKey);
    } else if (e.key === "End") {
      e.preventDefault();
      moveSelection(items.length, e.shiftKey);
    } else if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelection({ ids: new Set(items.map((i) => i.id)), primary: primary?.id ?? null, anchor: primary?.id ?? null });
    } else if (e.key === " " || e.key === "Enter") {
      if (primary?.hasPdf) {
        e.preventDefault();
        setPdfOpen((v) => !v);
      }
    } else if ((e.key === "Delete" || e.key === "Backspace") && !view.trash) {
      e.preventDefault();
      if (multiSelection.length > 0) void runBulk({ kind: "trash" });
      else if (primary) trashReference(primary);
    } else if (e.key === "Escape" && selectedItems.length > 1) {
      select(primary?.id ?? null);
    } else if (e.key === "c" && !mod && primary) {
      void citation.copyCitation(primary.id, "apa");
    }
  }

  /** Het artikel dat na verwijderen geselecteerd wordt: de volgende, anders de vorige. */
  function neighbourOf(ids: Set<string>): string | null {
    const last = items.findLastIndex((i) => ids.has(i.id));
    const after = items.slice(last + 1).find((i) => !ids.has(i.id));
    const before = items.slice(0, last).findLast((i) => !ids.has(i.id));
    return after?.id ?? before?.id ?? null;
  }

  function selectAfterRemoval(ids: Set<string>) {
    const next = neighbourOf(ids);
    setSelection(next ? { ids: new Set([next]), primary: next, anchor: next } : NO_SELECTION);
    if (!next) setMobilePane("list");
  }

  function trashReference(reference: ReferenceRecord) {
    selectAfterRemoval(new Set([reference.id]));
    setPdfOpen(false);
    trashMutation.mutate(reference.id, {
      onError: (error) => {
        select(reference.id);
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
    if (!reselect) selectAfterRemoval(new Set([reference.id]));
    restoreMutation.mutate(reference.id, {
      onError: (error) => toast.error("Terugzetten mislukt", error.message),
      onSuccess: () => {
        if (reselect) select(reference.id);
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
    selectAfterRemoval(new Set([reference.id]));
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
    setSelection(NO_SELECTION);
    emptyTrashMutation.mutate(undefined, {
      onError: (error) => toast.error("Legen mislukt", error.message),
      onSuccess: (deleted) =>
        toast.success(`${deleted} ${deleted === 1 ? "artikel" : "artikelen"} definitief verwijderd`),
    });
  }

  async function runBulk(request: BulkRequest) {
    const targets = multiSelection.length > 0 ? multiSelection : primary ? [primary] : [];
    if (targets.length === 0) return;
    const ids = targets.map((r) => r.id);
    const n = ids.length;
    const label = `${n} ${n === 1 ? "artikel" : "artikelen"}`;

    if (request.kind === "bibtex") {
      const bib = targets.map(formatBibtex).join("\n\n");
      const result = await shareOrCopyText(bib, { title: `BibTeX (${label})` });
      if (result === "copied") toast.success(`BibTeX van ${label} gekopieerd`);
      return;
    }
    if (request.kind === "purge") {
      const ok = await toast.confirm({
        title: `${label} definitief verwijderen?`,
        description: "PDF's en notities gaan mee. Dit kun je niet ongedaan maken.",
        confirmLabel: "Definitief verwijderen",
        danger: true,
      });
      if (!ok) return;
    }

    const action: BulkAction =
      request.kind === "status"
        ? { action: "update", patch: { status: request.status } }
        : request.kind === "starred"
          ? { action: "update", patch: { starred: request.starred } }
          : { action: request.kind };
    if (action.action !== "update") selectAfterRemoval(new Set(ids));

    bulkMutation.mutate(
      { ...action, ids },
      {
        onError: (error) => toast.error("Actie mislukt", error.message),
        onSuccess: () => {
          if (request.kind === "trash") {
            toast.show({
              kind: "success",
              message: `${label} naar de prullenbak`,
              action: {
                label: "Ongedaan maken",
                onClick: () => bulkMutation.mutate({ action: "restore", ids }),
              },
            });
          } else if (request.kind === "restore") toast.success(`${label} teruggezet`);
          else if (request.kind === "purge") toast.success(`${label} definitief verwijderd`);
          else toast.success(`${label} bijgewerkt`);
        },
      },
    );
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
    if (view.trash) changeView(DEFAULT_VIEW);
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
        if (view.trash) changeView(DEFAULT_VIEW);
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

  function startInspectorResize(e: React.PointerEvent) {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const start = inspectorWidth;
    let latest = start;
    function onMove(ev: PointerEvent) {
      latest = Math.max(INSPECTOR_MIN, Math.min(INSPECTOR_MAX, start - (ev.clientX - startX)));
      setDraftInspectorWidth(latest);
    }
    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      setDraftInspectorWidth(null);
      setInspectorWidth(latest);
    }
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  async function logout() {
    await flushPendingNotes();
    await api("/api/auth/logout", { method: "POST" });
    await clearOfflineCache();
    queryClient.clear();
    router.replace("/login");
    router.refresh();
  }

  const filtered = Boolean(debouncedQuery) || view.status !== "all" || view.starred || view.hasPdf;
  const loading = list.isPending || (list.isFetching && list.isPlaceholderData);
  const listError = list.error && !unauthorized ? list.error.message : null;

  const cardList = (className: string) => (
    <ReferenceList
      title={listTitle}
      items={items}
      loading={loading}
      error={listError}
      filtered={filtered}
      trash={view.trash}
      selectedId={primary?.id ?? null}
      className={className}
      query={query}
      searchRef={mobileSearchRef}
      onQueryChange={setQuery}
      onSelect={(id) => select(id)}
      onOpenMenu={() => setMobileMenuOpen(true)}
      onOpenPalette={() => setPaletteOpen(true)}
      onAdd={openAdd}
      onUploadPdf={() => importFileRef.current?.click()}
      onManual={() => setFormOpen(true)}
      onEmptyTrash={() => void emptyTrash()}
    />
  );

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

      <Toolbar
        query={query}
        field={field}
        searchRef={searchRef}
        listMode={listMode}
        sidebarOpen={sidebarOpen}
        inspectorOpen={inspectorOpen}
        pdfOpen={showPdf}
        canShare={Boolean(primary)}
        canOpenPdf={Boolean(primary?.hasPdf) && multiSelection.length === 0}
        trash={view.trash}
        onQueryChange={setQuery}
        onFieldChange={setField}
        onListModeChange={setListMode}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
        onTogglePdf={() => setPdfOpen(!showPdf)}
        onNew={openAdd}
        onShare={() => {
          if (multiSelection.length > 0) void runBulk({ kind: "bibtex" });
          else if (primary) void exporter.exportReference(primary, primary.hasPdf ? "pdf" : "summary");
        }}
        onOpenPalette={() => setPaletteOpen(true)}
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
            "z-50 hidden",
            sidebarOpen && "lg:flex",
            mobileMenuOpen &&
              "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:!flex max-lg:w-[min(18.5rem,86vw)] max-lg:pt-[env(safe-area-inset-top,0px)] max-lg:pb-[env(safe-area-inset-bottom,0px)]",
          )}
        >
          <Sidebar
            user={user}
            view={view}
            counts={counts.data}
            onViewChange={changeView}
            onClose={() => setMobileMenuOpen(false)}
            onUploadPdf={() => importFileRef.current?.click()}
            onOpenPalette={() => setPaletteOpen(true)}
            onLogout={() => void logout()}
          />
        </div>

        {/* Telefoon: kaartenlijst */}
        {cardList(cn("lg:hidden", mobilePane === "detail" ? "hidden" : "flex"))}

        {/* Desktop: lijstkop + tabel, kaarten of PDF */}
        <div className="hidden min-w-0 flex-1 flex-col bg-[var(--bg-panel)] lg:flex">
          {showPdf && primary ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] px-4">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{primary.title}</p>
                <span className="kbd">Esc</span>
                <button
                  type="button"
                  aria-label="PDF sluiten"
                  title="PDF sluiten (Esc)"
                  className="btn-ghost grid h-7 w-7 place-items-center rounded-md"
                  onClick={() => setPdfOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <PdfViewer key={primary.id} url={`/api/references/${primary.id}/pdf`} title={primary.title} />
              </div>
            </div>
          ) : (
            <>
              <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4">
                <h2 className="truncate text-sm font-semibold tracking-tight">{listTitle}</h2>
                <span className={cn("text-xs", listError ? "text-[var(--danger)]" : "text-[var(--text-muted)]")}>
                  {listError
                    ? `Laden mislukt: ${listError}`
                    : loading && items.length === 0
                      ? "Laden…"
                      : `${items.length} ${items.length === 1 ? "artikel" : "artikelen"}`}
                </span>
                {view.trash && (
                  <button
                    type="button"
                    className="btn-secondary btn-danger ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs"
                    disabled={items.length === 0}
                    onClick={() => void emptyTrash()}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Prullenbak legen
                  </button>
                )}
              </div>
              {listMode === "table" ? (
                <ReferenceTable
                  items={items}
                  loading={loading}
                  selectedIds={selectedIds}
                  primaryId={primary?.id ?? null}
                  visibleColumns={columns}
                  widths={widths}
                  sort={sort}
                  density={density}
                  emptyState={
                    <div className="px-6 py-14 text-center text-sm text-[var(--text-muted)]">
                      {view.trash
                        ? "De prullenbak is leeg."
                        : filtered
                          ? "Geen artikelen gevonden."
                          : "Nog geen artikelen. Sleep een PDF hierheen of plak een DOI via Ctrl K."}
                    </div>
                  }
                  onSortChange={setSort}
                  onColumnsChange={setColumns}
                  onWidthsChange={setWidths}
                  onRowClick={clickRow}
                  onRowOpen={(id) => {
                    select(id);
                    if (items.find((i) => i.id === id)?.hasPdf) setPdfOpen(true);
                  }}
                  onKeyDown={onTableKey}
                />
              ) : (
                cardList("flex")
              )}
            </>
          )}
        </div>

        {/* Versleepbare scheiding + inspector */}
        {inspectorOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Breedte van de inspector aanpassen"
            onPointerDown={startInspectorResize}
            onDoubleClick={() => setInspectorWidth(INSPECTOR_DEFAULT)}
            className="hidden w-1 shrink-0 cursor-col-resize border-l border-[var(--border)] hover:bg-[var(--accent-muted)] lg:block"
          />
        )}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col max-lg:flex-1",
            mobilePane === "list" ? "max-lg:hidden" : "max-lg:flex",
            inspectorOpen ? "lg:flex lg:shrink-0" : "lg:hidden",
          )}
          style={{ ["--inspector-w" as string]: `${draftInspectorWidth ?? inspectorWidth}px` }}
        >
          <div className="flex min-h-0 flex-1 flex-col lg:w-[var(--inspector-w)]">
            <Inspector
              reference={primary}
              selection={multiSelection}
              hidden={false}
              pdfOpen={showPdf}
              onBack={() => setMobilePane("list")}
              onSelect={(id) => select(id)}
              onLibraryChanged={() => void invalidateLibrary()}
              onTrash={trashReference}
              onRestore={(reference) => restoreReference(reference)}
              onPurge={(reference) => void purgeReference(reference)}
              onTogglePdf={() => setPdfOpen(!showPdf)}
              onBulk={(request) => void runBulk(request)}
              citation={citation}
              exporter={exporter}
            />
          </div>
        </div>

        {(pdfDropActive || pdfImporting) && <DropOverlay importing={pdfImporting} />}
      </div>

      <StatusBar
        total={items.length}
        selected={selectedItems.length}
        fetching={list.isFetching && !loading}
        density={density}
        onDensityChange={setDensity}
      />

      {paletteOpen && (
        <CommandPalette
          selected={primary}
          importing={doiImporting}
          onClose={() => setPaletteOpen(false)}
          onImportDoi={(doi) => void importDoi(doi)}
          onNew={() => setFormOpen(true)}
          onCopyApa={() => {
            if (primary) void citation.copyCitation(primary.id, "apa");
          }}
          onExport={(mode) => {
            if (primary) void exporter.exportReference(primary, mode);
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
            if (view.trash) changeView(DEFAULT_VIEW);
            select(item.id);
          }}
        />
      )}
    </div>
  );
}
