"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import {
  BookOpen,
  Command,
  LogOut,
  Menu,
  Plus,
  Search,
  Star,
  Upload,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { ReferenceRecord, RefStatus } from "@/lib/references/types";
import type { SessionPayload } from "@/lib/auth/session";
import { PdfViewer } from "./PdfViewer";
import { cn } from "@/lib/utils";
import { cleanDoiForLookup } from "@/lib/doi/normalize";

type Props = {
  user: SessionPayload;
};

type FilterStatus = RefStatus | "all";

const emptyForm = {
  title: "",
  authors: "",
  year: "",
  journal: "",
  doi: "",
  abstract: "",
};

export function LibraryApp({ user }: Props) {
  const [items, setItems] = useState<ReferenceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [hasPdfOnly, setHasPdfOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [highlights, setHighlights] = useState<
    { id: string; page: number; quote: string | null; color: string }[]
  >([]);
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
  const [deletingRef, setDeletingRef] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const pdfDropDepth = useRef(0);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (starredOnly) params.set("starred", "1");
    if (hasPdfOnly) params.set("hasPdf", "1");
    const res = await fetch(`/api/references?${params}`);
    const data = (await res.json()) as { items?: ReferenceRecord[] };
    const list = data.items ?? [];
    setItems(list);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
    setLoading(false);
  }, [query, filterStatus, starredOnly, hasPdfOnly, selectedId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const loadNote = useCallback(async (id: string) => {
    const res = await fetch(`/api/references/${id}/notes`);
    const data = (await res.json()) as { note?: { body: string } | null };
    setNote(data.note?.body ?? "");
  }, []);

  const loadHighlights = useCallback(async (attachmentId: string) => {
    const res = await fetch(`/api/highlights?attachmentId=${attachmentId}`);
    const data = (await res.json()) as {
      items?: { id: string; page: number; quote: string | null; color: string }[];
    };
    setHighlights(data.items ?? []);
  }, []);

  useEffect(() => {
    if (selectedId) void loadNote(selectedId);
    else setNote("");
  }, [selectedId, loadNote]);

  useEffect(() => {
    setDoiEdit(selected?.doi ?? "");
  }, [selected?.id, selected?.doi]);

  useEffect(() => {
    setTitleExpanded(false);
    setMobileDetailTab(selected?.hasPdf ? "pdf" : "info");
  }, [selected?.id, selected?.hasPdf]);

  useEffect(() => {
    if (selected?.attachmentId) void loadHighlights(selected.attachmentId);
    else setHighlights([]);
  }, [selected?.attachmentId, loadHighlights]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape") return;
        if (paletteOpen) return;
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
  }, [items, selected, paletteOpen]);

  async function copyCitation(id: string, style: string) {
    const res = await fetch(`/api/cite/${id}?style=${style}`);
    const data = (await res.json()) as { citation?: string };
    if (data.citation) await navigator.clipboard.writeText(data.citation);
  }

  async function addHighlight() {
    if (!selected?.attachmentId || !hlQuote.trim()) return;
    await fetch("/api/highlights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachmentId: selected.attachmentId,
        page: Number(hlPage) || 1,
        quote: hlQuote.trim(),
        color: "yellow",
        rects: [{ x: 0, y: 0, w: 0, h: 0 }],
      }),
    });
    setHlQuote("");
    await loadHighlights(selected.attachmentId);
  }

  async function saveNote() {
    if (!selectedId) return;
    setNoteSaving(true);
    await fetch(`/api/references/${selectedId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: note }),
    });
    setNoteSaving(false);
  }

  async function importDoi(doi: string, save = true) {
    const res = await fetch("/api/doi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doi, save }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      alert(err.error ?? "DOI mislukt");
      return;
    }
    const data = (await res.json()) as { item?: ReferenceRecord };
    await load();
    if (data.item) {
      setSelectedId(data.item.id);
      setMobilePane("detail");
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
    const res = await fetch("/api/references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        year: form.year ? Number(form.year) : null,
        journal: form.journal || null,
        doi: form.doi || null,
        abstract: form.abstract || null,
        authors,
      }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { item: ReferenceRecord };
    setForm(emptyForm);
    setFormOpen(false);
    await load();
    setSelectedId(data.item.id);
    setMobilePane("detail");
  }

  async function uploadPdf(file: File) {
    if (!selectedId) return;
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/references/${selectedId}/pdf`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      alert(err.error ?? "Upload mislukt");
      return;
    }
    await load();
  }

  async function importPdfAsReference(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      alert("Alleen PDF-bestanden.");
      return;
    }
    setPdfImporting(true);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/references/from-pdf", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json()) as {
        error?: string;
        item?: ReferenceRecord;
        message?: string;
      };
      if (!res.ok) {
        alert(data.error ?? "Import mislukt");
        return;
      }
      await load();
      if (data.item) {
        setSelectedId(data.item.id);
        setMobilePane("detail");
      }
      if (data.message) alert(data.message);
    } catch {
      alert("Import mislukt — geen verbinding.");
    } finally {
      setPdfImporting(false);
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

  function onPdfDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  async function onPdfDrop(e: React.DragEvent) {
    e.preventDefault();
    pdfDropDepth.current = 0;
    setPdfDropActive(false);
    const files = [...e.dataTransfer.files].filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (files.length === 0) {
      alert("Sleep een PDF-bestand.");
      return;
    }
    for (const file of files) {
      await importPdfAsReference(file);
    }
  }

  async function saveDoi() {
    if (!selectedId) return;
    setDoiSaving(true);
    try {
      const res = await fetch(`/api/references/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi: doiEdit.trim() || null }),
      });
      const data = (await res.json()) as { error?: string; item?: ReferenceRecord };
      if (!res.ok) {
        alert(data.error ?? "DOI opslaan mislukt");
        return;
      }
      if (data.item) setDoiEdit(data.item.doi ?? "");
      await load();
    } catch {
      alert("DOI opslaan mislukt — geen verbinding.");
    } finally {
      setDoiSaving(false);
    }
  }

  async function deleteSelectedReference() {
    if (!selectedId || !selected) return;
    const ok = window.confirm(
      `"${selected.title.slice(0, 80)}${selected.title.length > 80 ? "…" : ""}" verwijderen? PDF en notities gaan mee.`,
    );
    if (!ok) return;
    setDeletingRef(true);
    try {
      const res = await fetch(`/api/references/${selectedId}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Verwijderen mislukt");
        return;
      }
      setSelectedId(null);
      setMobilePane("list");
      await load();
    } catch {
      alert("Verwijderen mislukt — geen verbinding.");
    } finally {
      setDeletingRef(false);
    }
  }

  async function refreshMetadataFromDoi() {
    if (!selectedId) return;
    setRefreshingMeta(true);
    try {
      const payload = doiEdit.trim()
        ? JSON.stringify({ doi: cleanDoiForLookup(doiEdit.trim()) })
        : "{}";
      const res = await fetch(
        `/api/references/${selectedId}/refresh-metadata`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: payload,
        },
      );
      let data: { error?: string; item?: ReferenceRecord } = {};
      try {
        data = (await res.json()) as { error?: string; item?: ReferenceRecord };
      } catch {
        alert(`Metadata ophalen mislukt (HTTP ${res.status}).`);
        return;
      }
      if (res.status === 401) {
        alert("Sessie verlopen — log opnieuw in.");
        return;
      }
      if (!res.ok) {
        alert(data.error ?? "Metadata ophalen mislukt");
        return;
      }
      await load();
      if (data.item) setSelectedId(data.item.id);
    } catch {
      alert("Metadata ophalen mislukt — geen verbinding.");
    } finally {
      setRefreshingMeta(false);
    }
  }

  async function toggleStar() {
    if (!selected) return;
    await fetch(`/api/references/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: !selected.starred }),
    });
    await load();
  }

  async function setStatus(status: RefStatus) {
    if (!selected) return;
    await fetch(`/api/references/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const sidebar = (
    <aside className="panel flex h-full w-full flex-col border-r lg:w-[var(--sidebar-w)] lg:shrink-0">
      <div className="flex items-center gap-2 border-b border-[var(--border)] p-4">
        <BookOpen className="h-5 w-5 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Referentie</p>
          <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
        </div>
        <button
          type="button"
          className="btn-ghost grid h-11 w-11 shrink-0 place-items-center rounded-lg lg:hidden"
          aria-label="Menu sluiten"
          onClick={() => setMobileMenuOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3 text-sm">
        <FilterBtn active={filterStatus === "all"} onClick={() => setFilterStatus("all")}>
          Alle artikelen
        </FilterBtn>
        <FilterBtn active={filterStatus === "unread"} onClick={() => setFilterStatus("unread")}>
          Ongelezen
        </FilterBtn>
        <FilterBtn active={filterStatus === "reading"} onClick={() => setFilterStatus("reading")}>
          Bezig
        </FilterBtn>
        <FilterBtn active={filterStatus === "read"} onClick={() => setFilterStatus("read")}>
          Gelezen
        </FilterBtn>
        <FilterBtn active={starredOnly} onClick={() => setStarredOnly((v) => !v)}>
          <Star className="mr-2 inline h-3.5 w-3.5" /> Favorieten
        </FilterBtn>
        <FilterBtn active={hasPdfOnly} onClick={() => setHasPdfOnly((v) => !v)}>
          Met PDF
        </FilterBtn>
      </nav>
      <div className="space-y-1 border-t border-[var(--border)] p-3 text-sm">
        <div className="mb-2 lg:hidden">
          <p className="mb-1.5 px-1 text-xs text-[var(--text-muted)]">Thema</p>
          <ThemeSelector variant="icons" />
        </div>
        <button
          type="button"
          className="btn-ghost flex w-full items-center gap-2 rounded-lg px-3 py-3 lg:hidden"
          onClick={() => {
            setMobileMenuOpen(false);
            importFileRef.current?.click();
          }}
        >
          <Upload className="h-4 w-4" /> PDF uploaden
        </button>
        <button
          type="button"
          className="btn-ghost flex w-full items-center gap-2 rounded-lg px-3 py-3 lg:hidden"
          onClick={() => {
            setMobileMenuOpen(false);
            setPaletteOpen(true);
          }}
        >
          <Command className="h-4 w-4" /> DOI / zoeken
        </button>
        <Link href="/instellingen" className="btn-ghost block rounded-lg px-3 py-2 max-lg:py-3">
          Instellingen
        </Link>
        <button type="button" onClick={() => void logout()} className="btn-ghost flex w-full items-center gap-2 rounded-lg px-3 py-2 max-lg:py-3">
          <LogOut className="h-4 w-4" /> Uitloggen
        </button>
      </div>
    </aside>
  );

  const listPane = (
    <section
      className={cn(
        "panel flex h-full flex-col border-r lg:w-[var(--list-w)] lg:shrink-0",
        mobilePane === "detail" ? "hidden lg:flex" : "flex w-full",
      )}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
        <button
          type="button"
          className="btn-ghost grid h-11 w-11 shrink-0 place-items-center rounded-lg lg:hidden"
          aria-label="Menu"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="relative flex-1">
          <Search className="absolute top-3 left-2.5 h-4 w-4 text-[var(--text-muted)] lg:top-2.5" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoeken… (/)"
            className="input w-full rounded-lg py-2 pr-3 pl-9 text-sm max-lg:h-11 max-lg:py-2.5"
          />
        </div>
        <button
          type="button"
          className="btn-primary grid h-11 w-11 place-items-center rounded-lg p-0 lg:h-auto lg:w-auto lg:p-2"
          title="Nieuw (n)"
          onClick={() => {
            if (window.matchMedia("(max-width: 1023px)").matches) {
              setAddSheetOpen(true);
            } else {
              setFormOpen(true);
            }
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="btn-ghost hidden place-items-center rounded-lg p-2 lg:grid"
          title="Command palette (Ctrl+K)"
          onClick={() => setPaletteOpen(true)}
        >
          <Command className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <p className="p-4 text-sm text-[var(--text-muted)]">Laden…</p>
        )}
        {!loading && items.length === 0 && (
          <>
            <p className="hidden p-6 text-sm text-[var(--text-muted)] lg:block">
              Nog geen artikelen. Sleep een PDF hierheen, plak een DOI (Ctrl+K) of voeg
              handmatig toe.
            </p>
            <div className="space-y-3 p-6 lg:hidden">
              <p className="text-sm text-[var(--text-muted)]">
                Nog geen artikelen. Upload een PDF of voeg er een handmatig toe.
              </p>
              <button
                type="button"
                className="btn-primary flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium"
                onClick={() => importFileRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> PDF uploaden
              </button>
              <button
                type="button"
                className="btn-ghost flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm"
                onClick={() => setFormOpen(true)}
              >
                <Plus className="h-4 w-4" /> Handmatig artikel
              </button>
            </div>
          </>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSelectedId(item.id);
              setMobilePane("detail");
              setMobileDetailTab(item.hasPdf ? "pdf" : "info");
            }}
            className={cn(
              "block w-full border-b border-[var(--border)] px-4 py-3 text-left transition max-lg:py-3.5",
              selectedId === item.id
                ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent-muted)]"
                : "hover:bg-[var(--accent-soft)]/60",
            )}
          >
            <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {[item.authors[0]?.familyName, item.year, item.journal].filter(Boolean).join(" · ")}
              {item.hasPdf ? " · PDF" : ""}
            </p>
          </button>
        ))}
      </div>
    </section>
  );

  const inspector = (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        mobilePane === "list" ? "hidden lg:flex" : "flex w-full",
      )}
    >
      {!selected ? (
        <div className="flex flex-1 items-center justify-center p-8 text-[var(--text-muted)]">
          Selecteer een artikel
        </div>
      ) : (
        <>
          <div className="flex flex-col border-b border-[var(--border)] lg:hidden">
            <div className="flex items-center gap-1 px-1 py-1">
              <button
                type="button"
                className="btn-ghost inline-flex h-11 shrink-0 items-center rounded-lg px-2 text-sm"
                onClick={() => setMobilePane("list")}
              >
                ← Lijst
              </button>
              <div className="ml-auto flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => void toggleStar()}
                  className="btn-ghost grid h-11 w-11 place-items-center rounded-lg"
                  aria-label={selected.starred ? "Favoriet uit" : "Favoriet"}
                >
                  <Star className={cn("h-4 w-4", selected.starred && "fill-amber-400 text-amber-500")} />
                </button>
                <select
                  value={selected.status}
                  onChange={(e) => void setStatus(e.target.value as RefStatus)}
                  className="input h-11 max-w-[9.5rem] rounded-lg px-2 text-sm"
                  aria-label="Status"
                >
                  <option value="unread">Ongelezen</option>
                  <option value="reading">Bezig</option>
                  <option value="read">Gelezen</option>
                </select>
                <button
                  type="button"
                  title="Artikel verwijderen"
                  disabled={deletingRef}
                  onClick={() => void deleteSelectedReference()}
                  className="btn-ghost grid h-11 w-11 place-items-center rounded-lg text-[var(--danger)] hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <button
              type="button"
              className="px-4 pb-2 text-left"
              onClick={() => setTitleExpanded((v) => !v)}
            >
              <h1
                className={cn(
                  "font-semibold leading-snug",
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
                  "mt-0.5 text-xs text-[var(--text-muted)]",
                  !titleExpanded && (mobileDetailTab === "pdf" ? "hidden" : "line-clamp-1"),
                )}
              >
                {selected.authors.map((a) => `${a.givenName} ${a.familyName}`.trim()).join(", ")}
              </p>
            </button>
            {selected.hasPdf && (
              <div
                className="mx-3 mb-2 grid grid-cols-2 gap-1 rounded-lg bg-[var(--accent-soft)] p-1"
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
                      ? "bg-[var(--bg-panel)] text-[var(--accent)] shadow-sm"
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
                      ? "bg-[var(--bg-panel)] text-[var(--accent)] shadow-sm"
                      : "text-[var(--text-muted)]",
                  )}
                  onClick={() => setMobileDetailTab("pdf")}
                >
                  PDF
                </button>
              </div>
            )}
          </div>

          <div className="hidden flex-wrap items-start gap-2 border-b border-[var(--border)] p-4 lg:flex">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold leading-snug">{selected.title}</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {selected.authors.map((a) => `${a.givenName} ${a.familyName}`.trim()).join(", ")}
              </p>
            </div>
            <button type="button" onClick={() => void toggleStar()} className="btn-ghost rounded-lg p-2">
              <Star className={cn("h-4 w-4", selected.starred && "fill-amber-400 text-amber-500")} />
            </button>
            <select
              value={selected.status}
              onChange={(e) => void setStatus(e.target.value as RefStatus)}
              className="input rounded-lg px-2 py-1 text-sm"
            >
              <option value="unread">Ongelezen</option>
              <option value="reading">Bezig</option>
              <option value="read">Gelezen</option>
            </select>
            <button
              type="button"
              title="Artikel verwijderen"
              disabled={deletingRef}
              onClick={() => void deleteSelectedReference()}
              className="btn-ghost rounded-lg p-2 text-[var(--danger)] hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-2 lg:grid-rows-1">
            <div
              className={cn(
                "min-h-0 overflow-y-auto border-b border-[var(--border)] p-4 lg:border-r lg:border-b-0",
                selected.hasPdf && mobileDetailTab === "pdf" ? "hidden lg:block" : "block flex-1",
              )}
            >
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                {(["apa", "mla", "chicago"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="btn-ghost rounded-lg border border-[var(--border)] px-2 py-1 uppercase max-lg:min-h-11 max-lg:px-3"
                    onClick={() => void copyCitation(selected.id, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="mb-1 text-[var(--text-muted)]">DOI</dt>
                  <dd className="space-y-2">
                    <input
                      type="text"
                      className="input w-full rounded-lg px-3 py-2 text-sm"
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
                        className="btn-primary rounded-lg px-2 py-1 text-xs"
                        disabled={doiSaving}
                        onClick={() => void saveDoi()}
                      >
                        {doiSaving ? "Opslaan…" : "DOI opslaan"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                        disabled={refreshingMeta || !doiEdit.trim()}
                        onClick={() => void refreshMetadataFromDoi()}
                        title="Titel, abstract en overige velden via Crossref"
                      >
                        <RefreshCw
                          className={cn("h-3 w-3", refreshingMeta && "animate-spin")}
                        />
                        {refreshingMeta ? "Ophalen…" : "Metadata ophalen"}
                      </button>
                      {selected.doi && (
                        <a
                          className="text-xs text-[var(--accent)] underline"
                          href={`https://doi.org/${cleanDoiForLookup(selected.doi)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          doi.org ↗
                        </a>
                      )}
                    </div>
                  </dd>
                </div>
                {selected.journal && (
                  <div>
                    <dt className="text-[var(--text-muted)]">Tijdschrift</dt>
                    <dd>{selected.journal}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-[var(--text-muted)]">Abstract</dt>
                  <dd className="leading-relaxed">
                    {selected.abstract || (
                      <span className="text-[var(--text-muted)]">
                        Nog leeg — gebruik &quot;Metadata ophalen&quot; bij een geldige DOI.
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                <label className="text-sm font-medium">Notities</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={6}
                  className="input mt-1 w-full rounded-lg p-2 text-sm"
                  placeholder="Markdown-notities…"
                />
                <button
                  type="button"
                  disabled={noteSaving}
                  onClick={() => void saveNote()}
                  className="btn-primary mt-2 rounded-lg px-3 py-1.5 text-sm"
                >
                  {noteSaving ? "Opslaan…" : "Notitie opslaan"}
                </button>
              </div>

              {selected.hasPdf && (
                <div className="mt-4">
                  <p className="text-sm font-medium">Highlights</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="input w-16 rounded-lg px-2 py-1 text-sm"
                      value={hlPage}
                      onChange={(e) => setHlPage(e.target.value)}
                      placeholder="Pag."
                    />
                    <input
                      className="input flex-1 rounded-lg px-2 py-1 text-sm"
                      value={hlQuote}
                      onChange={(e) => setHlQuote(e.target.value)}
                      placeholder="Geciteerde tekst…"
                    />
                    <button
                      type="button"
                      className="btn-primary rounded-lg px-2 py-1 text-sm"
                      onClick={() => void addHighlight()}
                    >
                      +
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                    {highlights.map((h) => (
                      <li key={h.id}>
                        p.{h.page}: {h.quote}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex gap-2">
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
                <button
                  type="button"
                  className="btn-ghost flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> PDF uploaden
                </button>
              </div>
            </div>

            <div
              className={cn(
                "min-h-0 flex-col lg:flex lg:min-h-0 lg:p-4",
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
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--text-muted)]"
                  style={{ background: "var(--pdf-bg)" }}
                >
                  <p>Geen PDF — upload of sleep een PDF op de bibliotheek</p>
                  <p className="text-xs">Nieuwe PDF → automatisch artikel + DOI/Crossref</p>
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
        className="relative flex min-h-0 flex-1"
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
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-[var(--accent)]"
            style={{ background: "color-mix(in srgb, var(--accent-soft) 85%, transparent)" }}
          >
            <p className="rounded-xl px-6 py-4 text-sm font-medium shadow-lg panel">
              {pdfImporting
                ? "PDF importeren — DOI zoeken…"
                : "PDF loslaten — nieuw artikel met metadata"}
            </p>
          </div>
        )}
      </div>

      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] max-lg:pt-[max(0.75rem,env(safe-area-inset-top))]"
          style={{ background: "var(--overlay)" }}
        >
          <div className="panel w-full max-w-lg rounded-xl border shadow-xl">
            <input
              autoFocus
              value={paletteQuery}
              onChange={(e) => setPaletteQuery(e.target.value)}
              placeholder="DOI plakken, zoeken…"
              className="input w-full rounded-t-xl border-0 border-b px-4 py-3 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Escape") setPaletteOpen(false);
                if (e.key === "Enter" && paletteQuery.trim()) {
                  void importDoi(paletteQuery.trim(), true);
                }
              }}
            />
            <div className="space-y-1 p-2 text-sm">
              <PaletteAction label="DOI importeren en opslaan" onClick={() => void importDoi(paletteQuery.trim(), true)} />
              <PaletteAction label="Nieuw artikel" onClick={() => { setFormOpen(true); setPaletteOpen(false); }} />
              {selected && (
                <PaletteAction label="APA-citaat kopiëren" onClick={() => void copyCitation(selected.id, "apa")} />
              )}
              <PaletteAction label="Sluiten" onClick={() => setPaletteOpen(false)} />
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
          <div className="panel relative w-full rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
            <h2 className="text-lg font-semibold">Nieuw</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Op de telefoon kun je een PDF kiezen in plaats van slepen.
            </p>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                className="btn-primary flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium"
                onClick={() => {
                  importFileRef.current?.click();
                  setAddSheetOpen(false);
                }}
              >
                <Upload className="h-5 w-5 shrink-0" />
                <span>
                  PDF uploaden
                  <span className="mt-0.5 block text-xs font-normal opacity-90">
                    Nieuw artikel, metadata via DOI als die in de PDF staat
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="btn-ghost flex min-h-12 w-full items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-3 text-left text-sm"
                onClick={() => {
                  setAddSheetOpen(false);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-5 w-5 shrink-0" /> Handmatig artikel
              </button>
              <button
                type="button"
                className="btn-ghost flex min-h-12 w-full items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-3 text-left text-sm"
                onClick={() => {
                  setAddSheetOpen(false);
                  setPaletteOpen(true);
                }}
              >
                <Command className="h-5 w-5 shrink-0" /> DOI plakken
              </button>
              <button
                type="button"
                className="btn-ghost min-h-11 w-full rounded-lg px-3 py-2 text-sm"
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
          <div className="panel w-full max-w-lg rounded-xl border p-4 shadow-xl max-lg:max-h-[min(92dvh,100%)] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:rounded-t-2xl max-lg:pb-[max(1rem,env(safe-area-inset-bottom))]">
            <h2 className="text-lg font-semibold">Nieuw artikel</h2>
            <div className="mt-3 space-y-2">
              {(["title", "authors", "year", "journal", "doi"] as const).map((key) => (
                <input
                  key={key}
                  placeholder={
                    key === "authors"
                      ? "Auteurs (Jan Jansen; Piet Pietersen)"
                      : key.charAt(0).toUpperCase() + key.slice(1)
                  }
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="input w-full rounded-lg px-3 py-2 text-sm max-lg:min-h-11"
                />
              ))}
              <textarea
                placeholder="Abstract"
                value={form.abstract}
                onChange={(e) => setForm((f) => ({ ...f, abstract: e.target.value }))}
                className="input w-full rounded-lg px-3 py-2 text-sm"
                rows={3}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost rounded-lg px-3 py-2 text-sm max-lg:min-h-11" onClick={() => setFormOpen(false)}>
                Annuleren
              </button>
              <button type="button" className="btn-primary rounded-lg px-3 py-2 text-sm max-lg:min-h-11" onClick={() => void createManual()}>
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-2 text-left transition max-lg:py-3",
        active ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "btn-ghost",
      )}
    >
      {children}
    </button>
  );
}

function PaletteAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn-ghost w-full rounded-lg px-3 py-2 text-left max-lg:min-h-11" onClick={onClick}>
      {label}
    </button>
  );
}
