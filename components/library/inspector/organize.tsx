"use client";

import { useState } from "react";
import { Check, Folder, GitMerge, X } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import {
  useBulkAction,
  useGroups,
  useOrganize,
  usePatchReference,
  useTags,
} from "@/lib/library/hooks";
import type { GroupRecord, ReferenceRecord } from "@/lib/references/types";
import { cn } from "@/lib/utils";
import { DetailSection, LabelPicker, authorShort } from "../shared";

/** Groepsnamen met pad ("Sepsis › Vocht"), voor keuzelijsten. */
export function groupOptions(groups: GroupRecord[]): { id: string; label: string }[] {
  const manual = groups.filter((g) => g.kind === "manual");
  const byId = new Map(manual.map((g) => [g.id, g]));
  const path = (g: GroupRecord): string => {
    const parent = g.parentId ? byId.get(g.parentId) : undefined;
    return parent ? `${path(parent)} › ${g.name}` : g.name;
  };
  return manual.map((g) => ({ id: g.id, label: path(g) })).sort((a, b) => a.label.localeCompare(b.label, "nl"));
}

/** Invoer voor trefwoorden: Enter of komma voegt toe, met suggesties uit bestaande trefwoorden. */
export function TagInput({
  onAdd,
  placeholder = "Trefwoord toevoegen…",
}: {
  onAdd: (name: string) => void;
  placeholder?: string;
}) {
  const { data: tags = [] } = useTags();
  const [value, setValue] = useState("");

  function commit() {
    const name = value.trim().replace(/,$/, "").trim();
    if (name) onAdd(name);
    setValue("");
  }

  return (
    <>
      <input
        list="referentie-tags"
        value={value}
        onChange={(e) => {
          // Een komma rondt het trefwoord af, zoals Enter.
          if (e.target.value.endsWith(",")) {
            const name = e.target.value.slice(0, -1).trim();
            if (name) onAdd(name);
            setValue("");
          } else {
            setValue(e.target.value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        aria-label="Trefwoord toevoegen"
        maxLength={100}
        className="input min-w-[8rem] flex-1 rounded-md px-2 py-1 text-xs max-lg:min-h-10 max-lg:text-base"
      />
      <datalist id="referentie-tags">
        {tags.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
    </>
  );
}

export function OrganizeSection({ reference }: { reference: ReferenceRecord }) {
  const toast = useToast();
  const patch = usePatchReference();
  const bulk = useBulkAction();
  const { data: groups = [] } = useGroups();
  const options = groupOptions(groups);
  const inGroups = options.filter((o) => reference.groupIds.includes(o.id));
  const available = options.filter((o) => !reference.groupIds.includes(o.id));

  function save(fields: { label?: number | null; tags?: string[] }) {
    patch.mutate(
      { id: reference.id, patch: fields },
      { onError: (error) => toast.error("Wijziging niet opgeslagen", error.message) },
    );
  }

  function setGroup(groupId: string, remove: boolean) {
    bulk.mutate(
      { action: "group", groupId, remove, ids: [reference.id] },
      { onError: (error) => toast.error("Groep niet bijgewerkt", error.message) },
    );
  }

  return (
    <DetailSection title="Ordenen">
      <dl className="grid grid-cols-[6.5rem_1fr] items-start gap-x-4 gap-y-3 text-sm max-sm:grid-cols-1 max-sm:gap-y-1.5">
        <dt className="pt-0.5 text-[var(--text-muted)]">Label</dt>
        <dd className="max-sm:mb-2">
          <LabelPicker value={reference.label} onChange={(label) => save({ label })} />
        </dd>

        <dt className="pt-1 text-[var(--text-muted)]">Trefwoorden</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-1.5 max-sm:mb-2">
          {reference.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-subtle)] py-0.5 pr-1 pl-2.5 text-xs ring-1 ring-[var(--border)]"
            >
              {tag}
              <button
                type="button"
                aria-label={`Trefwoord ${tag} weghalen`}
                className="grid h-4 w-4 place-items-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] max-lg:h-7 max-lg:w-7"
                onClick={() => save({ tags: reference.tags.filter((t) => t !== tag) })}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <TagInput
            onAdd={(name) => {
              if (reference.tags.some((t) => t.toLocaleLowerCase("nl") === name.toLocaleLowerCase("nl"))) return;
              save({ tags: [...reference.tags, name] });
            }}
          />
        </dd>

        <dt className="pt-1 text-[var(--text-muted)]">Groepen</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
          {inGroups.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] py-0.5 pr-1 pl-2 text-xs text-[var(--accent)]"
            >
              <Folder className="h-3 w-3" />
              {g.label}
              <button
                type="button"
                aria-label={`Uit groep ${g.label} halen`}
                className="grid h-4 w-4 place-items-center rounded hover:bg-[var(--bg-hover)] max-lg:h-7 max-lg:w-7"
                onClick={() => setGroup(g.id, true)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {available.length > 0 ? (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setGroup(e.target.value, false);
              }}
              aria-label="Aan groep toevoegen"
              className="input rounded-md px-2 py-1 text-xs text-[var(--text-muted)] max-lg:min-h-10"
            >
              <option value="">Aan groep toevoegen…</option>
              {available.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          ) : (
            inGroups.length === 0 && (
              <span className="text-xs text-[var(--text-subtle)]">
                Maak een groep in de zijbalk (+ bij Groepen).
              </span>
            )
          )}
        </dd>
      </dl>
    </DetailSection>
  );
}

/** Acties voor een selectie: label, trefwoord en groep. */
export function BulkOrganize({
  ids,
  currentGroupId,
}: {
  ids: string[];
  /** Als de lijst een handmatige groep toont: "uit deze groep halen". */
  currentGroupId: string | null;
}) {
  const toast = useToast();
  const bulk = useBulkAction();
  const { data: groups = [] } = useGroups();
  const options = groupOptions(groups);
  const n = ids.length;

  function run(action: Parameters<typeof bulk.mutate>[0], message: string) {
    bulk.mutate(action, {
      onError: (error) => toast.error("Actie mislukt", error.message),
      onSuccess: () => toast.success(message),
    });
  }

  return (
    <>
      <p className="section-label mt-5 mb-2">Label</p>
      <LabelPicker
        value={null}
        onChange={(label) =>
          run({ action: "update", patch: { label }, ids }, label ? `Label gezet bij ${n} artikelen` : `Label weggehaald bij ${n} artikelen`)
        }
      />
      <p className="section-label mt-5 mb-2">Trefwoord toevoegen</p>
      <div className="flex">
        <TagInput
          placeholder="Trefwoord voor de selectie…"
          onAdd={(tag) => run({ action: "tag", tag, ids }, `Trefwoord "${tag}" toegevoegd aan ${n} artikelen`)}
        />
      </div>
      <p className="section-label mt-5 mb-2">Groep</p>
      <div className="flex flex-wrap gap-2">
        {options.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const option = options.find((o) => o.id === e.target.value);
              if (option) run({ action: "group", groupId: option.id, ids }, `${n} artikelen toegevoegd aan ${option.label}`);
            }}
            aria-label="Selectie aan groep toevoegen"
            className="input rounded-lg px-2.5 py-1.5 text-sm"
          >
            <option value="">Aan groep toevoegen…</option>
            {options.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        )}
        {currentGroupId && options.some((o) => o.id === currentGroupId) && (
          <button
            type="button"
            className="btn-secondary rounded-lg px-3 py-1.5 text-sm"
            onClick={() =>
              run({ action: "group", groupId: currentGroupId, remove: true, ids }, `${n} artikelen uit deze groep gehaald`)
            }
          >
            Uit deze groep halen
          </button>
        )}
      </div>
    </>
  );
}

/** Vergelijking van een set mogelijke dubbelen, met kiezen wat je bewaart. */
export function DuplicatesPanel({
  set,
  onMerged,
}: {
  set: ReferenceRecord[];
  onMerged: (keepId: string) => void;
}) {
  const toast = useToast();
  const { merge } = useOrganize();
  // Standaard het vollediger artikel bewaren: met PDF, dan met abstract, dan het oudste.
  const best = [...set].sort(
    (a, b) =>
      Number(b.hasPdf) - Number(a.hasPdf) ||
      Number(Boolean(b.abstract)) - Number(Boolean(a.abstract)) ||
      a.createdAt.localeCompare(b.createdAt),
  )[0];
  const [keepId, setKeepId] = useState(best.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(set.map((r) => r.id)));
  const mergeIds = set.filter((r) => r.id !== keepId && selected.has(r.id)).map((r) => r.id);

  async function doMerge() {
    const ok = await toast.confirm({
      title: `${mergeIds.length + 1} artikelen samenvoegen?`,
      description:
        "Lege velden, PDF, notities, trefwoorden en groepen gaan naar het artikel dat je bewaart. De andere gaan naar de prullenbak, zodat je ze nog kunt terugzetten.",
      confirmLabel: "Samenvoegen",
    });
    if (!ok) return;
    merge.mutate(
      { keepId, mergeIds },
      {
        onError: (error) => toast.error("Samenvoegen mislukt", error.message),
        onSuccess: () => {
          toast.success("Samengevoegd", `${mergeIds.length} naar de prullenbak`);
          onMerged(keepId);
        },
      },
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-5">
      <p className="text-xs font-medium text-[var(--text-muted)]">Mogelijke dubbelen</p>
      <h2 className="mt-1 font-serif text-[1.1875rem] font-semibold">
        {set.length} artikelen lijken hetzelfde
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Zelfde DOI, of dezelfde titel en hetzelfde jaar. Kies welk artikel je bewaart.
      </p>
      <ul className="mt-4 space-y-2">
        {set.map((r) => {
          const keep = r.id === keepId;
          return (
            <li
              key={r.id}
              className={cn(
                "rounded-lg border p-3 text-sm",
                keep ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]",
              )}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  aria-label="Meenemen bij samenvoegen"
                  checked={keep || selected.has(r.id)}
                  disabled={keep}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    setSelected(next);
                  }}
                  className="mt-1 accent-[var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{r.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {[authorShort(r.authors), r.year, r.journal].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-subtle)]">
                    {[
                      r.doi && `DOI ${r.doi}`,
                      r.hasPdf ? "met PDF" : "geen PDF",
                      r.abstract ? "met abstract" : null,
                      `toegevoegd ${new Date(r.createdAt).toLocaleDateString("nl-NL")}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setKeepId(r.id)}
                  aria-pressed={keep}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                    keep ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "btn-secondary",
                  )}
                >
                  {keep && <Check className="h-3 w-3" />}
                  {keep ? "Bewaren" : "Deze bewaren"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-5">
        <button
          type="button"
          disabled={mergeIds.length === 0 || merge.isPending}
          onClick={() => void doMerge()}
          className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm"
        >
          <GitMerge className="h-4 w-4" />
          {merge.isPending ? "Samenvoegen…" : `Samenvoegen (${mergeIds.length + 1})`}
        </button>
      </div>
    </div>
  );
}

