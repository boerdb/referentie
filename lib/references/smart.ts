/**
 * Slimme groepen: opgeslagen zoekregels, op de server vertaald naar SQL.
 * Alleen velden en operatoren uit deze lijsten; waarden gaan altijd als parameter mee.
 */

export const SMART_FIELDS = {
  title: { label: "Titel", type: "text" },
  author: { label: "Auteur", type: "text" },
  journal: { label: "Tijdschrift", type: "text" },
  abstract: { label: "Abstract", type: "text" },
  doi: { label: "DOI", type: "text" },
  year: { label: "Jaar", type: "number" },
  status: { label: "Leesstatus", type: "status" },
  starred: { label: "Favoriet", type: "boolean" },
  hasPdf: { label: "Heeft PDF", type: "boolean" },
  tag: { label: "Trefwoord", type: "tag" },
  label: { label: "Label", type: "label" },
  added: { label: "Toegevoegd", type: "days" },
} as const;

export type SmartField = keyof typeof SMART_FIELDS;
export type FieldType = (typeof SMART_FIELDS)[SmartField]["type"];

export const OPERATORS: Record<FieldType, { id: SmartOp; label: string }[]> = {
  text: [
    { id: "contains", label: "bevat" },
    { id: "not_contains", label: "bevat niet" },
    { id: "is", label: "is" },
    { id: "empty", label: "is leeg" },
  ],
  number: [
    { id: "is", label: "is" },
    { id: "gt", label: "is na" },
    { id: "lt", label: "is voor" },
  ],
  status: [
    { id: "is", label: "is" },
    { id: "is_not", label: "is niet" },
  ],
  boolean: [
    { id: "is", label: "is ja" },
    { id: "is_not", label: "is nee" },
  ],
  tag: [
    { id: "is", label: "is" },
    { id: "is_not", label: "is niet" },
  ],
  label: [
    { id: "is", label: "is" },
    { id: "is_not", label: "is niet" },
  ],
  days: [
    { id: "within_days", label: "in de laatste … dagen" },
    { id: "older_than_days", label: "langer dan … dagen geleden" },
  ],
};

export type SmartOp =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "empty"
  | "gt"
  | "lt"
  | "within_days"
  | "older_than_days";

export type SmartRule = { field: SmartField; op: SmartOp; value: string };
export type SmartRules = { match: "all" | "any"; rules: SmartRule[] };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Controleert regels uit een request-body. */
export function parseSmartRules(input: unknown): Result<SmartRules> {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Ongeldige regels." };
  }
  const { match, rules } = input as { match?: unknown; rules?: unknown };
  if (match !== "all" && match !== "any") return { ok: false, error: "Kies alle of één van de regels." };
  if (!Array.isArray(rules) || rules.length === 0 || rules.length > 20) {
    return { ok: false, error: "Een slimme groep heeft 1 tot 20 regels." };
  }
  const out: SmartRule[] = [];
  for (const rule of rules) {
    const { field, op, value } = (rule ?? {}) as Record<string, unknown>;
    if (typeof field !== "string" || !(field in SMART_FIELDS)) {
      return { ok: false, error: "Onbekend veld in een regel." };
    }
    const type = SMART_FIELDS[field as SmartField].type;
    if (!OPERATORS[type].some((o) => o.id === op)) {
      return { ok: false, error: `Ongeldige voorwaarde voor ${SMART_FIELDS[field as SmartField].label.toLowerCase()}.` };
    }
    const text = typeof value === "string" ? value.trim().slice(0, 255) : String(value ?? "");
    const needsValue = op !== "empty" && type !== "boolean";
    if (needsValue && !text) {
      return { ok: false, error: `Vul een waarde in bij ${SMART_FIELDS[field as SmartField].label.toLowerCase()}.` };
    }
    if ((type === "number" || type === "days" || type === "label") && needsValue && !/^\d+$/.test(text)) {
      return { ok: false, error: `${SMART_FIELDS[field as SmartField].label} moet een getal zijn.` };
    }
    if (type === "status" && !["unread", "reading", "read"].includes(text)) {
      return { ok: false, error: "Ongeldige leesstatus." };
    }
    out.push({ field: field as SmartField, op: op as SmartOp, value: text });
  }
  return { ok: true, value: { match, rules: out } };
}

function like(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

const TEXT_COLUMN: Partial<Record<SmartField, string>> = {
  title: "r.title",
  journal: "r.journal",
  abstract: "r.abstract",
  doi: "r.doi",
};

const AUTHOR_EXISTS = `EXISTS (
  SELECT 1 FROM reference_authors ra JOIN authors a ON a.id = ra.author_id
  WHERE ra.reference_id = r.id AND CONCAT(a.given_name, ' ', a.family_name) LIKE ?
)`;

const TAG_EXISTS = `EXISTS (
  SELECT 1 FROM reference_tags rt JOIN tags t ON t.id = rt.tag_id
  WHERE rt.reference_id = r.id AND t.name = ?
)`;

/** Eén regel als SQL-voorwaarde op alias `r` (ref_items). */
function ruleToSql(rule: SmartRule): { sql: string; params: unknown[] } {
  const { field, op, value } = rule;
  const column = TEXT_COLUMN[field];
  if (column) {
    if (op === "contains") return { sql: `${column} LIKE ?`, params: [like(value)] };
    if (op === "not_contains") return { sql: `(${column} IS NULL OR ${column} NOT LIKE ?)`, params: [like(value)] };
    if (op === "is") return { sql: `${column} = ?`, params: [value] };
    return { sql: `(${column} IS NULL OR ${column} = '')`, params: [] };
  }
  switch (field) {
    case "author":
      if (op === "not_contains") return { sql: `NOT ${AUTHOR_EXISTS}`, params: [like(value)] };
      if (op === "empty") {
        return { sql: "NOT EXISTS (SELECT 1 FROM reference_authors ra WHERE ra.reference_id = r.id)", params: [] };
      }
      return { sql: AUTHOR_EXISTS, params: [op === "is" ? value : like(value)] };
    case "year":
      return { sql: `r.year ${op === "gt" ? ">" : op === "lt" ? "<" : "="} ?`, params: [Number(value)] };
    case "status":
      return { sql: `r.status ${op === "is_not" ? "<>" : "="} ?`, params: [value] };
    case "starred":
      return { sql: `r.starred = ${op === "is" ? 1 : 0}`, params: [] };
    case "hasPdf":
      return {
        sql: `${op === "is" ? "" : "NOT "}EXISTS (SELECT 1 FROM attachments x WHERE x.reference_id = r.id)`,
        params: [],
      };
    case "tag":
      return { sql: op === "is_not" ? `NOT ${TAG_EXISTS}` : TAG_EXISTS, params: [value] };
    case "label":
      return op === "is_not"
        ? { sql: "(r.label IS NULL OR r.label <> ?)", params: [Number(value)] }
        : { sql: "r.label = ?", params: [Number(value)] };
    case "added":
      return {
        sql: `r.created_at ${op === "within_days" ? ">=" : "<"} (CURRENT_TIMESTAMP - INTERVAL ? DAY)`,
        params: [Number(value)],
      };
    default:
      return { sql: "1 = 0", params: [] };
  }
}

/** Alle regels samen als één voorwaarde. */
export function smartRulesToSql(rules: SmartRules): { sql: string; params: unknown[] } {
  const parts = rules.rules.map(ruleToSql);
  if (parts.length === 0) return { sql: "1 = 0", params: [] };
  return {
    sql: `(${parts.map((p) => p.sql).join(rules.match === "all" ? " AND " : " OR ")})`,
    params: parts.flatMap((p) => p.params),
  };
}
