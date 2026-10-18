"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import {
  BookOpen,
  Braces,
  Check,
  ChevronLeft,
  Circle,
  CircleCheck,
  Command,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Inbox,
  Library,
  Loader2,
  LogOut,
  Menu,
  PenLine,
  Plus,
  Search,
  Settings,
  Share2,
  Star,
  Upload,
  RefreshCw,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import type { ReferenceRecord, RefStatus } from "@/lib/references/types";
import type { SessionPayload } from "@/lib/auth/session";
import { formatBibtex, formatShareSummary } from "@/lib/cite/formats";
import {
  pdfFileNameFromTitle,
  shareOrCopyText,
  shareOrDownloadPdf,
} from "@/lib/share/files";
import { CitationPanel } from "./CitationPanel";
import { PdfViewer } from "./PdfViewer";
import { cn } from "@/lib/utils";
import { cleanDoiForLookup } from "@/lib/doi/normalize";
import { api } from "@/lib/api/client";
import { looksLikePdfFile } from "@/lib/uploads/is-pdf";
import { clearOfflineCache } from "@/lib/pwa/cache";
import { useToast } from "@/components/ui/Toaster";

type Props = {
  user: SessionPayload;
};

type FilterStatus = RefStatus | "all";

type NoteStatus = "idle" | "saving" | "saved" | "error";

type Highlight = { id: string; page: number; quote: string | null; color: string };

const emptyForm = {
  title: "",
  authors: "",
  year: "",
  journal: "",
  doi: "",
  abstract: "",
};

export function LibraryApp({ user }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<ReferenceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [hasPdfOnly, setHasPdfOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState<NoteStatus>("idle");
  const [highlightState, setHighlightState] = useState<{
    attachmentId: string | null;
    items: Highlight[];
  }>({ attachmentId: null, items: [] });
  const [hlPage, setHlPage] = useState("1");
  const [hlQuote, setHlQuote] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileDetailTab, setMobileDetailTab] = useState<"info" | "pdf">("info");
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [pdfDropActive, setPdfDropActive] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [refreshingMeta, setRefreshingMeta] = useState(false);
  const [doiEdit, setDoiEdit] = useState("");
  const [doiSaving, setDoiSaving] = useState(false);
  const [doiImporting, setDoiImporting] = useState(false);
  const doiImportLock = useRef(false);
  const [deletingRef, setDeletingRef] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [citeCopied, setCiteCopied] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const pdfDropDepth = useRef(0);
  const loadGen = useRef(0);
  /** Laatst opgeslagen notitie per referentie; autosave start pas als deze geladen is. */
  const noteSaved = useRef<{ refId: string | null; body: string }>({ refId: null, body: "" });
  const latestNote = useRef("");

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );
  const highlights =
    highlightState.attachmentId === selected?.attachmentId ? highlightState.items : [];

  // Velden die bij een ander artikel opnieuw beginnen: state aanpassen tijdens het
  // renderen in plaats van in een effect.
  const [syncedWith, setSyncedWith] = useState<{ id: string | null; doi: string | null }>({
    id: null,
    doi: null,
  });
  const currentId = selected?.id ?? null;
  const currentDoi = selected?.doi ?? null;
  if (syncedWith.id !== currentId || syncedWith.doi !== currentDoi) {
    if (syncedWith.id !== currentId) {
      setTitleExpanded(false);
      setMobileDetailTab("info");
    }
    setDoiEdit(currentDoi ?? "");
    setSyncedWith({ id: currentId, doi: currentDoi });
  }

  const listTitle =
    [
      filterStatus === "all" ? "Alle artikelen" : STATUS_LABEL[filterStatus],
      starredOnly && "favorieten",
      hasPdfOnly && "met PDF",
    ]
      .filter(Boolean)
      .join(" · ");

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (starredOnly) params.set("starred", "1");
    if (hasPdfOnly) params.set("hasPdf", "1");
    const res = await api<{ items?: ReferenceRecord[] }>(`/api/references?${params}`);
    // Een trager, ouder antwoord mag een nieuwere zoekopdracht niet overschrijven.
    if (gen !== loadGen.current) return;
    setLoading(false);
    if (!res.ok) {
      if (res.status === 401) router.replace("/login");
      else toast.error("Bibliotheek laden mislukt", res.error);
      return;
    }
    const list = res.data.items ?? [];
    setItems(list);
    setSelectedId((current) => current ?? list[0]?.id ?? null);
  }, [query, filterStatus, starredOnly, hasPdfOnly, router, toast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  /** Vervangt één artikel in de lijst zonder de hele lijst opnieuw op te halen. */
  const replaceItem = useCallback((item: ReferenceRecord) => {
    setItems((list) => list.map((i) => (i.id === item.id ? item : i)));
  }, []);

  const persistNote = useCallback(
    async (refId: string, body: string) => {
      setNoteStatus("saving");
      const res = await api(`/api/references/${refId}/notes`, {
        method: "POST",
        body: { body },
      });
      if (!res.ok) {
        setNoteStatus("error");
        toast.error("Notitie niet opgeslagen", res.error);
        return;
      }
      if (noteSaved.current.refId === refId) noteSaved.current.body = body;
      setNoteStatus("saved");
    },
    [toast],
  );

  // Notitie laden bij een ander artikel; een openstaande wijziging eerst wegschrijven.
  useEffect(() => {
    const previous = noteSaved.current;
    if (previous.refId && previous.refId !== selectedId && latestNote.current !== previous.body) {
      void persistNote(previous.refId, latestNote.current);
    }
    noteSaved.current = { refId: null, body: "" };
    if (!selectedId) return;
    let cancelled = false;
    void api<{ note?: { body: string } | null }>(`/api/references/${selectedId}/notes`).then(
      (res) => {
        if (cancelled) return;
        const body = res.ok ? (res.data.note?.body ?? "") : "";
        noteSaved.current = { refId: selectedId, body };
        latestNote.current = body;
        setNote(body);
        setNoteStatus("idle");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedId, persistNote]);

  // Automatisch opslaan, 800 ms na de laatste toetsaanslag.
  useEffect(() => {
    const { refId, body } = noteSaved.current;
    if (!refId || note === body) return;
    const t = setTimeout(() => void persistNote(refId, note), 800);
    return () => clearTimeout(t);
  }, [note, persistNote]);

  // Bij sluiten van het tabblad de laatste wijziging nog meesturen.
  useEffect(() => {
    function flush() {
      const { refId, body } = noteSaved.current;
      if (!refId || latestNote.current === body) return;
      navigator.sendBeacon(
        `/api/references/${refId}/notes`,
        new Blob([JSON.stringify({ body: latestNote.current })], { type: "application/json" }),
      );
    }
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const fetchHighlights = useCallback(async (attachmentId: string) => {
    const res = await api<{ items?: Highlight[] }>(
      `/api/highlights?attachmentId=${encodeURIComponent(attachmentId)}`,
    );
    return res.ok ? (res.data.items ?? []) : [];
  }, []);

  useEffect(() => {
    const attachmentId = selected?.attachmentId;
    if (!attachmentId) return;
    let cancelled = false;
    void fetchHighlights(attachmentId).then((list) => {
      if (!cancelled) setHighlightState({ attachmentId, items: list });
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.attachmentId, fetchHighlights]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          setPaletteOpen(true);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "/" && !paletteOpen) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        if (window.matchMedia("(max-width: 1023px)").matches) {
          setAddSheetOpen(true);
        } else {
          setFormOpen(true);
        }
        return;
      }
      if (!selected) return;
      const idx = items.findIndex((i) => i.id === selected.id);
      if (e.key === "j" && idx < items.length - 1) {
        setSelectedId(items[idx + 1].id);
      }
      if (e.key === "k" && idx > 0) {
        setSelectedId(items[idx - 1].id);
      }
      if (e.key === "c" && !e.metaKey) {
        void copyCitation(selected.id, "apa");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function copyCitation(id: string, style: string) {
    const res = await api<{ citation?: string }>(`/api/cite/${id}?style=${style}`);
    if (!res.ok || !res.data.citation) {
      toast.error("Citaat ophalen mislukt", res.ok ? undefined : res.error);
      return;
    }
    const citation = res.data.citation;

    let copied = false;
    try {
      await navigator.clipboard.writeText(citation);
      copied = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = citation;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand("copy");
      ta.remove();
    }

    try {
      if (!copied) {
        // Laatste redmiddel op iOS: share-sheet met het citaat
        const result = await shareOrCopyText(citation, {
          title: `${style.toUpperCase()}-citaat`,
        });
        setCiteCopied(
          result === "shared"
            ? `${style.toUpperCase()} gedeeld`
            : `${style.toUpperCase()} gekopieerd`,
        );
      } else {
        setCiteCopied(`${style.toUpperCase()} gekopieerd — plak waar je wilt`);
      }
      window.setTimeout(() => setCiteCopied(null), 3500);
    } catch {
      toast.error("Citaat kopiëren mislukt");
    }
  }

  async function exportSelected(mode: "pdf" | "summary" | "bibtex" = "pdf") {
    if (!selected || exporting) return;
    setExporting(true);
    try {
      if (mode === "bibtex") {
        const bib = formatBibtex(selected);
        const result = await shareOrCopyText(bib, { title: selected.title });
        if (result === "copied") toast.success("BibTeX gekopieerd");
        return;
      }
      if (mode === "summary" || !selected.hasPdf) {
        const text = formatShareSummary(selected);
        const result = await shareOrCopyText(text, { title: selected.title });
        if (result === "copied") toast.success("Artikelinfo gekopieerd");
        return;
      }
      await shareOrDownloadPdf(`/api/references/${selected.id}/pdf`, {
        fileName: pdfFileNameFromTitle(selected.title),
        title: selected.title,
      });
    } catch (err) {
      toast.error("Exporteren mislukt", err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  async function addHighlight() {
    const attachmentId = selected?.attachmentId;
    if (!attachmentId || !hlQuote.trim()) return;
    const res = await api("/api/highlights", {
      method: "POST",
      body: {
        attachmentId,
        page: Number(hlPage) || 1,
        quote: hlQuote.trim(),
        color: "yellow",
        rects: [{ x: 0, y: 0, w: 0, h: 0 }],
      },
    });
    if (!res.ok) {
      toast.error("Highlight niet opgeslagen", res.error);
      return;
    }
    setHlQuote("");
    setHighlightState({ attachmentId, items: await fetchHighlights(attachmentId) });
  }

  function onNoteChange(value: string) {
    latestNote.current = value;
    setNote(value);
  }

  async function saveNoteNow() {
    const { refId, body } = noteSaved.current;
    if (refId && latestNote.current !== body) await persistNote(refId, latestNote.current);
  }

  async function importDoi(doi: string, save = true) {
    if (doiImportLock.current) return;
    doiImportLock.current = true;
    setDoiImporting(true);
    const res = await api<{ item?: ReferenceRecord }>("/api/doi", {
      method: "POST",
      body: { doi, save },
    });
    doiImportLock.current = false;
    setDoiImporting(false);
    if (!res.ok) {
      toast.error("DOI ophalen mislukt", res.error);
      return;
    }
    await load();
    if (res.data.item) {
      setSelectedId(res.data.item.id);
      setMobilePane("detail");
      toast.success(
        "Artikel toegevoegd",
        res.data.item.hasPdf ? "Er is een open PDF gevonden en gekoppeld." : undefined,
      );
    }
    setPaletteOpen(false);
  }

  async function createManual() {
    const authors = form.authors
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((full) => {
        const parts = full.split(/\s+/);
        const familyName = parts.pop() ?? "";
        return { givenName: parts.join(" "), familyName };
      });
    const res = await api<{ item: ReferenceRecord }>("/api/references", {
      method: "POST",
      body: {
        title: form.title,
        year: form.year ? Number(form.year) : null,
        journal: form.journal || null,
        doi: form.doi || null,
        abstract: form.abstract || null,
        authors,
      },
    });
    if (!res.ok) {
      toast.error("Artikel niet opgeslagen", res.error);
      return;
    }
    setForm(emptyForm);
    setFormOpen(false);
    await load();
    setSelectedId(res.data.item.id);
    setMobilePane("detail");
  }

  async function uploadPdf(file: File) {
    if (!selectedId) return;
    const fd = new FormData();
    fd.set("file", file);
    const res = await api<{ item?: ReferenceRecord }>(`/api/references/${selectedId}/pdf`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      toast.error("Upload mislukt", res.error);
      return;
    }
    if (res.data.item) replaceItem(res.data.item);
    toast.success("PDF gekoppeld");
  }

  async function importPdfAsReference(file: File) {
    if (!looksLikePdfFile(file)) {
      toast.error("Alleen PDF-bestanden", file.name);
      return;
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
      return;
    }
    await load();
    if (res.data.item) {
      setSelectedId(res.data.item.id);
      setMobilePane("detail");
    }
    if (res.data.message) toast.success(res.data.message, file.name);
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

  function onPdfDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  async function onPdfDrop(e: React.DragEvent) {
    e.preventDefault();
    pdfDropDepth.current = 0;
    setPdfDropActive(false);
    const files = [...e.dataTransfer.files].filter(looksLikePdfFile);
    if (files.length === 0) {
      toast.info("Sleep een PDF-bestand");
      return;
    }
    for (const file of files) {
      await importPdfAsReference(file);
    }
  }

  async function saveDoi() {
    if (!selectedId) return;
    setDoiSaving(true);
    const res = await api<{ item?: ReferenceRecord }>(`/api/references/${selectedId}`, {
      method: "PATCH",
      body: { doi: doiEdit.trim() || null },
    });
    setDoiSaving(false);
    if (!res.ok) {
      toast.error("DOI opslaan mislukt", res.error);
      return;
    }
    if (res.data.item) {
      setDoiEdit(res.data.item.doi ?? "");
      replaceItem(res.data.item);
    }
    toast.success("DOI opgeslagen");
  }

  async function deleteSelectedReference() {
    if (!selectedId || !selected) return;
    const ok = await toast.confirm({
      title: "Artikel verwijderen?",
      description: `"${selected.title.slice(0, 80)}${selected.title.length > 80 ? "…" : ""}" wordt verwijderd, samen met de PDF en notities.`,
      confirmLabel: "Verwijderen",
      danger: true,
    });
    if (!ok) return;
    setDeletingRef(true);
    const res = await api(`/api/references/${selectedId}`, { method: "DELETE" });
    setDeletingRef(false);
    if (!res.ok) {
      toast.error("Verwijderen mislukt", res.error);
      return;
    }
    noteSaved.current = { refId: null, body: "" };
    setItems((list) => list.filter((i) => i.id !== selectedId));
    setSelectedId(null);
    setMobilePane("list");
    toast.success("Artikel verwijderd");
  }

  async function refreshMetadataFromDoi() {
    if (!selectedId) return;
    setRefreshingMeta(true);
    const res = await api<{ item?: ReferenceRecord }>(
      `/api/references/${selectedId}/refresh-metadata`,
      {
        method: "POST",
        body: doiEdit.trim() ? { doi: cleanDoiForLookup(doiEdit.trim()) } : {},
      },
    );
    setRefreshingMeta(false);
    if (!res.ok) {
      toast.error("Metadata ophalen mislukt", res.error);
      return;
    }
    if (res.data.item) replaceItem(res.data.item);
    toast.success("Metadata bijgewerkt");
  }

  /** Optimistisch bijwerken: direct tonen, bij een fout terugzetten. */
  async function patchSelected(patch: Partial<Pick<ReferenceRecord, "starred" | "status">>) {
    if (!selected) return;
    const before = selected;
    replaceItem({ ...selected, ...patch });
    const res = await api<{ item?: ReferenceRecord }>(`/api/references/${selected.id}`, {
      method: "PATCH",
      body: patch,
    });
    if (!res.ok) {
      replaceItem(before);
      toast.error("Wijziging niet opgeslagen", res.error);
      return;
    }
    if (res.data.item) replaceItem(res.data.item);
  }

  async function toggleStar() {
    if (selected) await patchSelected({ starred: !selected.starred });
  }

  async function setStatus(status: RefStatus) {
    await patchSelected({ status });
  }

  async function logout() {
    await saveNoteNow();
    await api("/api/auth/logout", { method: "POST" });
    await clearOfflineCache();
    router.replace("/login");
    router.refresh();
  }

  const sidebar = (
    <aside className="flex h-full w-full flex-col border-r border-[var(--border)] bg-[var(--bg-subtle)] lg:w-[var(--sidebar-w)] lg:shrink-0 max-lg:bg-[var(--bg-panel)]">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <BrandMark className="h-7 w-7 rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5" />
        <p className="flex-1 text-[0.9375rem] font-semibold tracking-tight">Referentie</p>
        <button
          type="button"
          className="btn-ghost grid h-11 w-11 shrink-0 place-items-center rounded-lg lg:hidden"
          aria-label="Menu sluiten"
          onClick={() => setMobileMenuOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2 pb-3 text-sm">
        <div className="space-y-0.5">
          <p className="section-label px-2.5 pb-1.5">Bibliotheek</p>
          {(["all", "unread", "reading", "read"] as const).map((s) => (
            <FilterBtn
              key={s}
              icon={STATUS_ICON[s]}
              active={filterStatus === s}
              onClick={() => {
                setFilterStatus(s);
                setMobileMenuOpen(false);
              }}
            >
              {s === "all" ? "Alle artikelen" : STATUS_LABEL[s]}
            </FilterBtn>
          ))}
          <Link
            href="/zoeken"
            className="btn-ghost flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left max-lg:py-3"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Search className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
            Literatuur zoeken
          </Link>
        </div>
        <div className="space-y-0.5">
          <p className="section-label px-2.5 pb-1.5">Filters</p>
          <FilterBtn icon={Star} active={starredOnly} onClick={() => setStarredOnly((v) => !v)}>
            Favorieten
          </FilterBtn>
          <FilterBtn icon={FileText} active={hasPdfOnly} onClick={() => setHasPdfOnly((v) => !v)}>
            Met PDF
          </FilterBtn>
        </div>
        <div className="space-y-0.5 lg:hidden">
          <p className="section-label px-2.5 pb-1.5">Toevoegen</p>
          <button
            type="button"
            className="btn-ghost flex w-full items-center gap-2.5 rounded-md px-2.5 py-3"
            onClick={() => {
              setMobileMenuOpen(false);
              importFileRef.current?.click();
            }}
          >
            <Upload className="h-4 w-4" /> PDF uploaden
          </button>
          <button
            type="button"
            className="btn-ghost flex w-full items-center gap-2.5 rounded-md px-2.5 py-3"
            onClick={() => {
              setMobileMenuOpen(false);
              setPaletteOpen(true);
            }}
          >
            <Command className="h-4 w-4" /> DOI / zoeken
          </button>
        </div>
      </nav>
      <div className="space-y-3 border-t border-[var(--border)] p-3 text-sm">
        <div className="lg:hidden">
          <p className="section-label mb-1.5 px-1">Thema</p>
          <ThemeSelector variant="icons" />
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)] uppercase">
            {initials(user)}
          </span>
          <div className="min-w-0 flex-1">
            {user.name && <p className="truncate text-sm font-medium">{user.name}</p>}
            <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
          </div>
          <Link
            href="/instellingen"
            title="Instellingen"
            aria-label="Instellingen"
            className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-md max-lg:h-11 max-lg:w-11"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <button
            type="button"
            title="Uitloggen"
            aria-label="Uitloggen"
            onClick={() => void logout()}
            className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-md max-lg:h-11 max-lg:w-11"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  const listPane = (
    <section
      className={cn(
        "panel flex h-full min-w-0 flex-col overflow-x-hidden border-r lg:w-[var(--list-w)] lg:shrink-0",
        mobilePane === "detail" ? "hidden lg:flex" : "flex w-full",
      )}
    >
      <div className="space-y-3 border-b border-[var(--border)] px-3 pt-3 pb-3 lg:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost -ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg lg:hidden"
            aria-label="Menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[0.9375rem] font-semibold tracking-tight">
              {listTitle}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {loading ? "Laden…" : `${items.length} ${items.length === 1 ? "artikel" : "artikelen"}`}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost hidden h-8 w-8 place-items-center rounded-md lg:grid"
            title="Opdrachtenpalet (Ctrl+K)"
            aria-label="Opdrachtenpalet"
            onClick={() => setPaletteOpen(true)}
          >
            <Command className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn-primary inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm max-lg:w-11 max-lg:px-0 lg:h-8"
            title="Nieuw artikel (n)"
            aria-label="Nieuw artikel"
            onClick={() => {
              if (window.matchMedia("(max-width: 1023px)").matches) {
                setAddSheetOpen(true);
              } else {
                setFormOpen(true);
              }
            }}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden lg:inline">Nieuw</span>
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op titel, auteur, DOI…"
            className="input w-full rounded-lg py-2 pr-10 pl-9 text-sm max-lg:h-11 max-lg:py-2.5"
          />
          <span className="kbd pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 lg:inline-flex">
            /
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && items.length === 0 && (
          <div className="space-y-px" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2 border-b border-[var(--border)] px-4 py-4">
                <div className="h-3.5 w-11/12 animate-pulse rounded bg-[var(--bg-subtle)]" />
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-[var(--bg-subtle)]" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--bg-subtle)]" />
              </div>
            ))}
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)]">
              <Inbox className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm font-medium">
              {query || filterStatus !== "all" || starredOnly || hasPdfOnly
                ? "Geen artikelen gevonden"
                : "Nog geen artikelen"}
            </p>
            <p className="mt-1 hidden max-w-[16rem] text-sm text-[var(--text-muted)] lg:block">
              Sleep een PDF hierheen, plak een DOI via <span className="kbd">Ctrl</span>{" "}
              <span className="kbd">K</span> of voeg handmatig een artikel toe.
            </p>
            <p className="mt-1 max-w-[16rem] text-sm text-[var(--text-muted)] lg:hidden">
              Upload een PDF of voeg er een handmatig toe.
            </p>
            <div className="mt-5 w-full max-w-[16rem] space-y-2 lg:hidden">
              <button
                type="button"
                className="btn-primary flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm"
                onClick={() => importFileRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> PDF uploaden
              </button>
              <button
                type="button"
                className="btn-secondary flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm"
                onClick={() => setFormOpen(true)}
              >
                <Plus className="h-4 w-4" /> Handmatig artikel
              </button>
            </div>
          </div>
        )}
        {items.map((item) => {
          const active = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSelectedId(item.id);
                setMobilePane("detail");
                setMobileDetailTab("info");
              }}
              className={cn(
                "relative block w-full border-b border-[var(--border)] px-4 py-3.5 text-left transition-colors",
                active
                  ? "bg-[var(--accent-soft)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--accent)]"
                  : "hover:bg-[var(--bg-hover)]",
              )}
            >
              <div className="flex items-start gap-2">
                <p
                  className={cn(
                    "line-clamp-2 flex-1 text-sm leading-snug font-medium",
                    active && "text-[var(--text)]",
                  )}
                >
                  {item.title}
                </p>
                {item.starred && (
                  <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-[var(--star)] text-[var(--star)]" />
                )}
              </div>
              <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                {[authorShort(item.authors), item.year, item.journal].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <StatusBadge status={item.status} />
                {item.hasPdf && (
                  <span className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-px text-[0.6875rem] font-medium text-[var(--text-muted)]">
                    <FileText className="h-3 w-3" /> PDF
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );

  const inspector = (
    <section
      className={cn(
        "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden",
        mobilePane === "list" ? "hidden lg:flex" : "flex w-full",
      )}
    >
      {!selected ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-panel)] text-[var(--text-subtle)] ring-1 ring-[var(--border)]">
            <BookOpen className="h-5 w-5" />
          </span>
          <p className="mt-4 text-sm font-medium">Geen artikel geselecteerd</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Kies een artikel uit de lijst, of gebruik <span className="kbd">j</span>{" "}
            <span className="kbd">k</span> om te navigeren.
          </p>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-col overflow-hidden border-b border-[var(--border)] lg:hidden">
            <div className="flex min-w-0 items-center gap-1 px-1 py-1">
              <button
                type="button"
                className="btn-ghost inline-flex h-11 shrink-0 items-center gap-1 rounded-lg pr-2.5 pl-1.5 text-sm font-medium"
                onClick={() => setMobilePane("list")}
              >
                <ChevronLeft className="h-5 w-5" /> Lijst
              </button>
              <div className="ml-auto flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => void toggleStar()}
                  className="btn-ghost grid h-11 w-11 place-items-center rounded-lg"
                  aria-label={selected.starred ? "Favoriet uit" : "Favoriet"}
                >
                  <Star
                    className={cn("h-4 w-4", selected.starred && "fill-[var(--star)] text-[var(--star)]")}
                  />
                </button>
                <button
                  type="button"
                  title={selected.hasPdf ? "PDF exporteren / delen" : "Artikel exporteren / delen"}
                  disabled={exporting}
                  onClick={() => void exportSelected(selected.hasPdf ? "pdf" : "summary")}
                  className="btn-ghost grid h-11 w-11 place-items-center rounded-lg"
                  aria-label="Exporteren"
                >
                  <Share2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Artikel verwijderen"
                  disabled={deletingRef}
                  onClick={() => void deleteSelectedReference()}
                  aria-label="Artikel verwijderen"
                  className="btn-ghost btn-danger grid h-11 w-11 place-items-center rounded-lg"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <button
              type="button"
              className="min-w-0 px-4 pb-2 text-left"
              onClick={() => setTitleExpanded((v) => !v)}
            >
              <h1
                className={cn(
                  "font-serif break-words font-semibold leading-snug",
                  titleExpanded
                    ? "text-[0.95rem]"
                    : mobileDetailTab === "pdf"
                      ? "line-clamp-1 text-sm"
                      : "line-clamp-3 text-[0.95rem]",
                )}
              >
                {selected.title}
              </h1>
              <p
                className={cn(
                  "mt-0.5 break-words text-xs text-[var(--text-muted)]",
                  !titleExpanded && (mobileDetailTab === "pdf" ? "hidden" : "line-clamp-1"),
                )}
              >
                {selected.authors.map((a) => `${a.givenName} ${a.familyName}`.trim()).join(", ")}
              </p>
            </button>
            <div
              className="mx-3 mb-2 grid grid-cols-3 gap-1 rounded-lg bg-[var(--bg-subtle)] p-1"
              role="radiogroup"
              aria-label="Leesstatus"
            >
              {(["unread", "reading", "read"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={selected.status === s}
                  onClick={() => void setStatus(s)}
                  className={cn(
                    "min-w-0 truncate rounded-md px-1 py-2 text-xs font-medium",
                    selected.status === s
                      ? "bg-[var(--bg-panel)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]"
                      : "text-[var(--text-muted)]",
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {selected.hasPdf && (
              <div
                className="mx-3 mb-2 grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-subtle)] p-1"
                role="tablist"
                aria-label="Artikelweergave"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileDetailTab === "info"}
                  className={cn(
                    "rounded-md py-2 text-sm font-medium",
                    mobileDetailTab === "info"
                      ? "bg-[var(--bg-panel)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]"
                      : "text-[var(--text-muted)]",
                  )}
                  onClick={() => setMobileDetailTab("info")}
                >
                  Artikel
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileDetailTab === "pdf"}
                  className={cn(
                    "rounded-md py-2 text-sm font-medium",
                    mobileDetailTab === "pdf"
                      ? "bg-[var(--bg-panel)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]"
                      : "text-[var(--text-muted)]",
                  )}
                  onClick={() => setMobileDetailTab("pdf")}
                >
                  PDF
                </button>
              </div>
            )}
          </div>

          <header className="hidden border-b border-[var(--border)] bg-[var(--bg-panel)] px-6 pt-5 pb-4 lg:block">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-muted)]">
                {[selected.journal, selected.year].filter(Boolean).join(" · ") || "Artikel"}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <div
                  className="mr-1 flex rounded-lg bg-[var(--bg-subtle)] p-0.5"
                  role="radiogroup"
                  aria-label="Leesstatus"
                >
                  {(["unread", "reading", "read"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={selected.status === s}
                      onClick={() => void setStatus(s)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                        selected.status === s
                          ? "bg-[var(--bg-panel)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text)]",
                      )}
                    >
                      <StatusDot status={s} />
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                <IconButton
                  label={selected.starred ? "Uit favorieten" : "Aan favorieten toevoegen"}
                  onClick={() => void toggleStar()}
                >
                  <Star
                    className={cn("h-4 w-4", selected.starred && "fill-[var(--star)] text-[var(--star)]")}
                  />
                </IconButton>
                <IconButton
                  label={selected.hasPdf ? "PDF exporteren / delen" : "Artikel exporteren / delen"}
                  disabled={exporting}
                  onClick={() => void exportSelected(selected.hasPdf ? "pdf" : "summary")}
                >
                  <Share2 className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label="Artikel verwijderen"
                  disabled={deletingRef}
                  onClick={() => void deleteSelectedReference()}
                  className="btn-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
            <h1 className="mt-2 font-serif text-[1.375rem] leading-tight font-semibold tracking-[-0.01em] text-balance">
              {selected.title}
            </h1>
            {selected.authors.length > 0 && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {selected.authors.map((a) => `${a.givenName} ${a.familyName}`.trim()).join(", ")}
              </p>
            )}
          </header>

          <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-2 lg:grid-rows-1">
            <div
              className={cn(
                "min-h-0 min-w-0 w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-y-contain border-b border-[var(--border)] bg-[var(--bg-panel)] [overflow-wrap:anywhere] lg:border-r lg:border-b-0",
                selected.hasPdf && mobileDetailTab === "pdf" ? "hidden lg:block" : "block flex-1",
              )}
            >
              <div className="divide-y divide-[var(--border)]">
                <DetailSection title="Citeren">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border-strong)] shadow-[var(--shadow-soft)]">
                      {(["apa", "mla", "chicago"] as const).map((s, i) => {
                        const copied = citeCopied?.toUpperCase().startsWith(s.toUpperCase());
                        return (
                          <button
                            key={s}
                            type="button"
                            title={`${s.toUpperCase()}-citaat kopiëren`}
                            className={cn(
                              "btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tracking-wide uppercase max-lg:min-h-11",
                              i > 0 && "border-l border-[var(--border-strong)]",
                              copied
                                ? "!bg-[var(--accent-soft)] !text-[var(--accent)]"
                                : "bg-[var(--bg-elevated)] !text-[var(--text)] hover:bg-[var(--bg-hover)]",
                            )}
                            onClick={() => void copyCitation(selected.id, s)}
                          >
                            {copied ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 opacity-60" />
                            )}
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={exporting}
                      className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs max-lg:min-h-11"
                      onClick={() => void exportSelected("bibtex")}
                      title="BibTeX delen of kopiëren"
                    >
                      <Braces className="h-3.5 w-3.5 opacity-60" />
                      BibTeX
                    </button>
                    <button
                      type="button"
                      disabled={exporting}
                      className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs max-lg:min-h-11"
                      onClick={() => void exportSelected(selected.hasPdf ? "pdf" : "summary")}
                      title={
                        selected.hasPdf
                          ? "PDF delen (WhatsApp, Bestanden, …)"
                          : "Artikelinfo delen"
                      }
                    >
                      <Share2 className="h-3.5 w-3.5 opacity-60" />
                      {exporting ? "Bezig…" : selected.hasPdf ? "PDF delen" : "Delen"}
                    </button>
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      citeCopied ? "font-medium text-[var(--success)]" : "text-[var(--text-subtle)]",
                    )}
                    role="status"
                  >
                    {citeCopied ?? "Klik op een stijl om het citaat naar het klembord te kopiëren."}
                  </p>
                </DetailSection>

                <DetailSection title="Gegevens">
                  <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-3 text-sm max-sm:grid-cols-1 max-sm:gap-y-1">
                    <dt className="pt-2 text-[var(--text-muted)] max-sm:pt-0">DOI</dt>
                    <dd className="min-w-0 space-y-2 max-sm:mb-2">
                      <input
                        type="text"
                        className="input w-full min-w-0 max-w-full rounded-lg px-3 py-1.5 font-mono text-[0.8125rem]"
                        placeholder="10.1038/…"
                        value={doiEdit}
                        onChange={(e) => setDoiEdit(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveDoi();
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="btn-primary rounded-md px-2.5 py-1 text-xs max-lg:min-h-10"
                          disabled={doiSaving || doiEdit.trim() === (selected.doi ?? "")}
                          onClick={() => void saveDoi()}
                        >
                          {doiSaving ? "Opslaan…" : "Opslaan"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs max-lg:min-h-10"
                          disabled={refreshingMeta || !doiEdit.trim()}
                          onClick={() => void refreshMetadataFromDoi()}
                          title="Titel, abstract en open PDF via de DOI"
                        >
                          <RefreshCw
                            className={cn("h-3 w-3", refreshingMeta && "animate-spin")}
                          />
                          {refreshingMeta ? "Ophalen…" : "Metadata ophalen"}
                        </button>
                        {selected.doi && (
                          <a
                            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                            href={`https://doi.org/${cleanDoiForLookup(selected.doi)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Openen op doi.org <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </dd>
                    {selected.journal && (
                      <>
                        <dt className="text-[var(--text-muted)]">Tijdschrift</dt>
                        <dd className="max-sm:mb-2">{selected.journal}</dd>
                      </>
                    )}
                    {selected.year && (
                      <>
                        <dt className="text-[var(--text-muted)]">Jaar</dt>
                        <dd className="tabular-nums max-sm:mb-2">{selected.year}</dd>
                      </>
                    )}
                    {(selected.volume || selected.issue || selected.pages) && (
                      <>
                        <dt className="text-[var(--text-muted)]">Uitgave</dt>
                        <dd className="tabular-nums max-sm:mb-2">
                          {[
                            selected.volume && `Jaargang ${selected.volume}`,
                            selected.issue && `nr. ${selected.issue}`,
                            selected.pages && `p. ${selected.pages}`,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </dd>
                      </>
                    )}
                  </dl>
                </DetailSection>

                <DetailSection title="Abstract">
                  {selected.abstract ? (
                    <p className="font-serif text-[0.9375rem] leading-relaxed text-[var(--text)] [overflow-wrap:anywhere]">
                      {selected.abstract}
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">
                      Nog geen abstract. Gebruik &quot;Metadata ophalen&quot; bij een geldige DOI.
                    </p>
                  )}
                </DetailSection>

                <DetailSection title="Kruisverwijzingen">
                  <CitationPanel
                    key={selected.id}
                    referenceId={selected.id}
                    doi={selected.doi}
                    onOpenInLibrary={(id) => {
                      setSelectedId(id);
                      setMobilePane("detail");
                    }}
                    onAdded={() => void load()}
                  />
                </DetailSection>

                <DetailSection title="Notities">
                  <textarea
                    value={note}
                    onChange={(e) => onNoteChange(e.target.value)}
                    onBlur={() => void saveNoteNow()}
                    rows={6}
                    aria-label="Notities"
                    className="input w-full min-w-0 max-w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
                    placeholder="Schrijf je notities in Markdown…"
                  />
                  <p
                    className={cn(
                      "mt-1.5 text-right text-xs",
                      noteStatus === "error" ? "text-[var(--danger)]" : "text-[var(--text-subtle)]",
                    )}
                    role="status"
                  >
                    {NOTE_STATUS_LABEL[noteStatus]}
                  </p>
                </DetailSection>

                {selected.hasPdf && (
                  <DetailSection title="Highlights">
                    <div className="flex min-w-0 gap-2">
                      <input
                        className="input w-16 shrink-0 rounded-lg px-2 py-1.5 text-center text-sm tabular-nums"
                        value={hlPage}
                        onChange={(e) => setHlPage(e.target.value)}
                        placeholder="Pag."
                        aria-label="Pagina"
                      />
                      <input
                        className="input min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm"
                        value={hlQuote}
                        onChange={(e) => setHlQuote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void addHighlight();
                        }}
                        placeholder="Geciteerde tekst…"
                        aria-label="Geciteerde tekst"
                      />
                      <button
                        type="button"
                        className="btn-secondary grid w-9 shrink-0 place-items-center rounded-lg"
                        aria-label="Highlight toevoegen"
                        disabled={!hlQuote.trim()}
                        onClick={() => void addHighlight()}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {highlights.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {highlights.map((h) => (
                          <li
                            key={h.id}
                            className="rounded-r-md border-l-2 border-[var(--star)] bg-[var(--bg-subtle)] py-1.5 pr-3 pl-3 text-sm break-words"
                          >
                            <span className="mr-2 text-xs font-medium text-[var(--text-subtle)] tabular-nums">
                              p. {h.page}
                            </span>
                            {h.quote}
                          </li>
                        ))}
                      </ul>
                    )}
                  </DetailSection>
                )}

                <DetailSection title="Bijlage">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadPdf(f);
                    }}
                  />
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                      <FileText className="h-4 w-4" />
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-[var(--text-muted)]">
                      {selected.hasPdf ? "PDF gekoppeld" : "Nog geen PDF gekoppeld"}
                    </p>
                    <button
                      type="button"
                      className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs max-lg:min-h-10"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      PDF uploaden
                    </button>
                  </div>
                </DetailSection>
              </div>
            </div>

            <div
              className={cn(
                "min-h-0 min-w-0 flex-col lg:flex lg:min-h-0 lg:p-4",
                selected.hasPdf
                  ? mobileDetailTab === "pdf"
                    ? "flex flex-1 p-2"
                    : "hidden lg:flex"
                  : "hidden lg:flex",
              )}
            >
              {selected.hasPdf ? (
                <PdfViewer
                  url={`/api/references/${selected.id}/pdf`}
                  title={selected.title}
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] p-6 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--bg-panel)] text-[var(--text-subtle)] ring-1 ring-[var(--border)]">
                    <FileText className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-sm font-medium">Geen PDF gekoppeld</p>
                  <p className="mt-1 max-w-xs text-sm text-[var(--text-muted)]">
                    Upload een PDF bij dit artikel. Een PDF die je op de bibliotheek sleept wordt
                    een nieuw artikel met metadata via DOI.
                  </p>
                  <button
                    type="button"
                    className="btn-secondary mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" /> PDF uploaden
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
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
          if (files.length === 0) return;
          void (async () => {
            for (const file of files) {
              await importPdfAsReference(file);
            }
          })();
        }}
      />
      <div
        className="relative flex min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-clip overflow-y-hidden"
        onDragEnter={onPdfDragEnter}
        onDragLeave={onPdfDragLeave}
        onDragOver={onPdfDragOver}
        onDrop={(e) => void onPdfDrop(e)}
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
          {sidebar}
        </div>
        {listPane}
        {inspector}
        {(pdfDropActive || pdfImporting) && (
          <div
            className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--accent)] backdrop-blur-[2px]"
            style={{ background: "color-mix(in srgb, var(--accent-soft) 80%, transparent)" }}
          >
            <div className="card flex items-center gap-3 px-5 py-4 shadow-[var(--shadow-lg)]">
              {pdfImporting ? (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
              ) : (
                <Upload className="h-5 w-5 text-[var(--accent)]" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {pdfImporting ? "PDF importeren…" : "Laat los om te importeren"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {pdfImporting
                    ? "DOI en metadata worden opgezocht"
                    : "Er wordt een nieuw artikel met metadata aangemaakt"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] max-lg:pt-[max(0.75rem,env(safe-area-inset-top))]"
          style={{ background: "var(--overlay)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
              <Search className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Plak een DOI of typ een opdracht…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-subtle)] max-lg:text-base"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setPaletteOpen(false);
                  if (e.key === "Enter" && paletteQuery.trim()) {
                    void importDoi(paletteQuery.trim(), true);
                  }
                }}
              />
              <span className="kbd hidden shrink-0 lg:inline-flex">Esc</span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-1.5 text-sm">
              <p className="section-label px-2.5 pt-2 pb-1">Toevoegen</p>
              <PaletteAction
                icon={Download}
                label={doiImporting ? "DOI en PDF ophalen…" : "DOI importeren en open PDF opslaan"}
                hint="Enter"
                disabled={!paletteQuery.trim() || doiImporting}
                onClick={() => void importDoi(paletteQuery.trim(), true)}
              />
              <PaletteAction
                icon={Plus}
                label="Nieuw artikel"
                hint="N"
                onClick={() => {
                  setFormOpen(true);
                  setPaletteOpen(false);
                }}
              />
              {selected && (
                <>
                  <p className="section-label px-2.5 pt-3 pb-1">Huidig artikel</p>
                  <PaletteAction
                    icon={Copy}
                    label="APA-citaat kopiëren"
                    hint="C"
                    onClick={() => {
                      setPaletteOpen(false);
                      void copyCitation(selected.id, "apa");
                    }}
                  />
                  <PaletteAction
                    icon={Share2}
                    label={selected.hasPdf ? "PDF exporteren / delen" : "Artikelinfo delen"}
                    onClick={() => {
                      setPaletteOpen(false);
                      void exportSelected(selected.hasPdf ? "pdf" : "summary");
                    }}
                  />
                  <PaletteAction
                    icon={Braces}
                    label="BibTeX exporteren"
                    onClick={() => {
                      setPaletteOpen(false);
                      void exportSelected("bibtex");
                    }}
                  />
                </>
              )}
              <div className="mt-1.5 border-t border-[var(--border)] pt-1.5 lg:hidden">
                <PaletteAction icon={X} label="Sluiten" onClick={() => setPaletteOpen(false)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {addSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center lg:hidden"
          style={{ background: "var(--overlay)" }}
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Sluiten"
            onClick={() => setAddSheetOpen(false)}
          />
          <div className="relative w-full rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg-panel)] px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lg)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-strong)]" />
            <h2 className="text-base font-semibold">Artikel toevoegen</h2>
            <div className="mt-3 space-y-2">
              <SheetOption
                icon={Upload}
                title="PDF uploaden"
                description="Nieuw artikel, metadata via DOI als die in de PDF staat"
                primary
                onClick={() => {
                  importFileRef.current?.click();
                  setAddSheetOpen(false);
                }}
              />
              <SheetOption
                icon={Download}
                title="DOI plakken"
                description="Metadata ophalen via Crossref"
                onClick={() => {
                  setAddSheetOpen(false);
                  setPaletteOpen(true);
                }}
              />
              <SheetOption
                icon={PenLine}
                title="Handmatig invoeren"
                description="Titel, auteurs en overige gegevens zelf invullen"
                onClick={() => {
                  setAddSheetOpen(false);
                  setFormOpen(true);
                }}
              />
              <button
                type="button"
                className="btn-ghost min-h-11 w-full rounded-lg px-3 py-2 text-sm font-medium"
                onClick={() => setAddSheetOpen(false)}
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 max-lg:items-end max-lg:p-0"
          style={{ background: "var(--overlay)" }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-[var(--shadow-lg)] max-lg:max-h-[min(92dvh,100%)] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:rounded-t-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Nieuw artikel</h2>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  Heb je een DOI? Vul die in en haal daarna de metadata op.
                </p>
              </div>
              <button
                type="button"
                aria-label="Sluiten"
                className="btn-ghost -mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-md max-lg:h-11 max-lg:w-11"
                onClick={() => setFormOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-x-3 gap-y-4 px-5 py-5">
              {FORM_FIELDS.map((f) => (
                <label key={f.key} className={cn("col-span-6 block space-y-1.5", f.span)}>
                  <span className="text-sm font-medium">
                    {f.label}
                    {f.key === "title" && <span className="text-[var(--danger)]"> *</span>}
                  </span>
                  <input
                    placeholder={f.placeholder}
                    inputMode={f.key === "year" ? "numeric" : undefined}
                    value={form[f.key]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className={cn(
                      "input w-full rounded-lg px-3 py-2 text-sm max-lg:min-h-11",
                      f.key === "doi" && "font-mono text-[0.8125rem]",
                    )}
                  />
                  {f.hint && (
                    <span className="block text-xs text-[var(--text-subtle)]">{f.hint}</span>
                  )}
                </label>
              ))}
              <label className="col-span-6 block space-y-1.5">
                <span className="text-sm font-medium">Abstract</span>
                <textarea
                  value={form.abstract}
                  onChange={(e) => setForm((f) => ({ ...f, abstract: e.target.value }))}
                  className="input w-full rounded-lg px-3 py-2 text-sm"
                  rows={4}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                className="btn-secondary rounded-lg px-3.5 py-2 text-sm max-lg:min-h-11"
                onClick={() => setFormOpen(false)}
              >
                Annuleren
              </button>
              <button
                type="button"
                disabled={!form.title.trim()}
                className="btn-primary rounded-lg px-3.5 py-2 text-sm max-lg:min-h-11"
                onClick={() => void createManual()}
              >
                Artikel opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<RefStatus, string> = {
  unread: "Ongelezen",
  reading: "Bezig",
  read: "Gelezen",
};

const NOTE_STATUS_LABEL: Record<NoteStatus, string> = {
  idle: "Wordt automatisch opgeslagen",
  saving: "Opslaan…",
  saved: "Opgeslagen",
  error: "Niet opgeslagen — probeer het opnieuw",
};

const STATUS_ICON: Record<FilterStatus, LucideIcon> = {
  all: Library,
  unread: Circle,
  reading: BookOpen,
  read: CircleCheck,
};

const STATUS_DOT: Record<RefStatus, string> = {
  unread: "bg-[var(--text-subtle)]",
  reading: "bg-[var(--warning)]",
  read: "bg-[var(--success)]",
};

const FORM_FIELDS: {
  key: Exclude<keyof typeof emptyForm, "abstract">;
  label: string;
  placeholder?: string;
  hint?: string;
  span?: string;
}[] = [
  { key: "title", label: "Titel" },
  {
    key: "authors",
    label: "Auteurs",
    placeholder: "Jan Jansen; Piet Pietersen",
    hint: "Scheid auteurs met een puntkomma.",
  },
  { key: "journal", label: "Tijdschrift", span: "sm:col-span-4" },
  { key: "year", label: "Jaar", placeholder: "2024", span: "sm:col-span-2" },
  { key: "doi", label: "DOI", placeholder: "10.1038/…" },
];

function initials(user: SessionPayload) {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).slice(0, 2) || "?";
}

function authorShort(authors: ReferenceRecord["authors"]) {
  const first = authors[0]?.familyName;
  if (!first) return null;
  if (authors.length === 1) return first;
  if (authors.length === 2) return `${first} & ${authors[1].familyName}`;
  return `${first} et al.`;
}

function StatusDot({ status }: { status: RefStatus }) {
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status])} aria-hidden />;
}

function StatusBadge({ status }: { status: RefStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-1.5 py-px text-[0.6875rem] font-medium text-[var(--text-muted)]">
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-5 lg:px-6">
      <h3 className="section-label mb-3">{title}</h3>
      {children}
    </section>
  );
}

function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn("btn-ghost grid h-8 w-8 place-items-center rounded-md", className)}
      {...props}
    >
      {children}
    </button>
  );
}

function FilterBtn({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: LucideIcon;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors max-lg:py-3",
        active
          ? "bg-[var(--bg-panel)] font-medium text-[var(--text)] shadow-[var(--shadow-soft)] ring-1 ring-[var(--border)]"
          : "btn-ghost",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-[var(--accent)]" : "text-[var(--text-subtle)]",
        )}
      />
      {children}
    </button>
  );
}

function PaletteAction({
  icon: Icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="btn-ghost flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left !text-[var(--text)] max-lg:min-h-11"
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
      <span className="flex-1">{label}</span>
      {hint && <span className="kbd hidden lg:inline-flex">{hint}</span>}
    </button>
  );
}

function SheetOption({
  icon: Icon,
  title,
  description,
  primary,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left",
        primary ? "btn-primary" : "btn-secondary",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          primary ? "bg-white/15" : "bg-[var(--bg-subtle)] text-[var(--text-muted)]",
        )}
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs font-normal opacity-75">{description}</span>
      </span>
    </button>
  );
}
