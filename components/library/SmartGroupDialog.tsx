"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useTags } from "@/lib/library/hooks";
import {
  OPERATORS,
  SMART_FIELDS,
  parseSmartRules,
  type SmartField,
  type SmartRule,
  type SmartRules,
} from "@/lib/references/smart";
import { LABELS } from "@/lib/references/types";
import { STATUSES, STATUS_LABEL } from "./shared";

type Props = {
  title: string;
  initialName?: string;
  initialRules?: SmartRules | null;
  saving: boolean;
  onClose: () => void;
  onSave: (name: string, rules: SmartRules) => void;
};

const NEW_RULE: SmartRule = { field: "title", op: "contains", value: "" };

function defaultValue(field: SmartField): string {
  const type = SMART_FIELDS[field].type;
  if (type === "status") return "unread";
  if (type === "label") return "1";
  if (type === "days") return "30";
  return "";
}

export function SmartGroupDialog({ title, initialName, initialRules, saving, onClose, onSave }: Props) {
  const { data: tags = [] } = useTags();
  const [name, setName] = useState(initialName ?? "");
  const [match, setMatch] = useState<SmartRules["match"]>(initialRules?.match ?? "all");
  const [rules, setRules] = useState<SmartRule[]>(initialRules?.rules ?? [NEW_RULE]);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, patch: Partial<SmartRule>) {
    setError(null);
    setRules((list) =>
      list.map((rule, i) => {
        if (i !== index) return rule;
        const next = { ...rule, ...patch };
        // Ander veld: een passende voorwaarde en waarde kiezen.
        if (patch.field && patch.field !== rule.field) {
          next.op = OPERATORS[SMART_FIELDS[patch.field].type][0].id;
          next.value = defaultValue(patch.field);
        }
        return next;
      }),
    );
  }

  function save() {
    if (!name.trim()) {
      setError("Geef de slimme groep een naam.");
      return;
    }
    const parsed = parseSmartRules({ match, rules });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onSave(name.trim(), parsed.value);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 max-lg:items-end max-lg:p-0"
      style={{ background: "var(--overlay)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-title"
        className="flex max-h-[min(90dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-[var(--shadow-lg)] max-lg:max-w-none max-lg:rounded-b-none max-lg:rounded-t-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="smart-title" className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              De groep toont steeds de artikelen die aan de regels voldoen.
            </p>
          </div>
          <button
            type="button"
            aria-label="Sluiten"
            className="btn-ghost -mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-md max-lg:h-11 max-lg:w-11"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Naam</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              maxLength={255}
              placeholder="Bijv. RCT's na 2022 met PDF"
              className="input w-full rounded-lg px-3 py-2 text-sm max-lg:min-h-11"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Toon artikelen die voldoen aan</span>
            <select
              value={match}
              onChange={(e) => setMatch(e.target.value as SmartRules["match"])}
              className="input rounded-md px-2 py-1 text-sm"
              aria-label="Alle of één van de regels"
            >
              <option value="all">alle regels</option>
              <option value="any">minstens één regel</option>
            </select>
          </div>

          <ul className="space-y-2">
            {rules.map((rule, index) => {
              const type = SMART_FIELDS[rule.field].type;
              return (
                <li key={index} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--bg-subtle)] p-2">
                  <select
                    value={rule.field}
                    onChange={(e) => update(index, { field: e.target.value as SmartField })}
                    aria-label="Veld"
                    className="input rounded-md px-2 py-1.5 text-sm"
                  >
                    {(Object.keys(SMART_FIELDS) as SmartField[]).map((f) => (
                      <option key={f} value={f}>
                        {SMART_FIELDS[f].label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rule.op}
                    onChange={(e) => update(index, { op: e.target.value as SmartRule["op"] })}
                    aria-label="Voorwaarde"
                    className="input rounded-md px-2 py-1.5 text-sm"
                  >
                    {OPERATORS[type].map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <RuleValue rule={rule} tags={tags.map((t) => t.name)} onChange={(value) => update(index, { value })} />
                  <button
                    type="button"
                    aria-label="Regel verwijderen"
                    disabled={rules.length === 1}
                    onClick={() => setRules((list) => list.filter((_, i) => i !== index))}
                    className="btn-ghost btn-danger ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={rules.length >= 20}
            onClick={() => setRules((list) => [...list, NEW_RULE])}
            className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
          >
            <Plus className="h-4 w-4" /> Regel toevoegen
          </button>
          {error && (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="btn-secondary rounded-lg px-3.5 py-2 text-sm max-lg:min-h-11"
            onClick={onClose}
          >
            Annuleren
          </button>
          <button
            type="button"
            disabled={saving}
            className="btn-primary rounded-lg px-3.5 py-2 text-sm max-lg:min-h-11"
            onClick={save}
          >
            {saving ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleValue({
  rule,
  tags,
  onChange,
}: {
  rule: SmartRule;
  tags: string[];
  onChange: (value: string) => void;
}) {
  const type = SMART_FIELDS[rule.field].type;
  if (type === "boolean" || rule.op === "empty") return null;
  const className = "input min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm";

  if (type === "status") {
    return (
      <select value={rule.value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Waarde">
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    );
  }
  if (type === "label") {
    return (
      <select value={rule.value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Waarde">
        {LABELS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    );
  }
  if (type === "tag") {
    return (
      <>
        <input
          list="smart-tags"
          value={rule.value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Trefwoord"
          className={className}
          aria-label="Waarde"
        />
        <datalist id="smart-tags">
          {tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </>
    );
  }
  return (
    <input
      value={rule.value}
      onChange={(e) => onChange(e.target.value)}
      inputMode={type === "number" || type === "days" ? "numeric" : undefined}
      placeholder={type === "number" ? "2022" : type === "days" ? "30" : "Tekst"}
      className={className}
      aria-label="Waarde"
    />
  );
}
