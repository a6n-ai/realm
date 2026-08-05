// Shared shape for the inquiries bulk-import feature: the mappable fields (shown as
// selects in the column-mapping UI, and read the same way on the server) and the
// sheet-value -> pipeline-stage mapping.
import type { InquiryStage } from "@/lib/services/inquiries.service";

export type ImportFieldKey =
  | "date"
  | "phone"
  | "fullName"
  | "email"
  | "stage"
  | "source"
  | "subSource"
  | "followUpDate";

// Single-column fields the user maps one sheet header to each. Date and Phone are
// the only hard requirements — everything else gets a sensible default when left
// unmapped or blank (see route.ts).
export const IMPORT_FIELDS: { key: ImportFieldKey; label: string; required: boolean }[] = [
  { key: "date", label: "Date", required: true },
  { key: "phone", label: "Phone Number", required: true },
  { key: "fullName", label: "Full Name", required: false },
  { key: "email", label: "Email", required: false },
  { key: "stage", label: "Stage", required: false },
  { key: "source", label: "Source", required: false },
  { key: "subSource", label: "SubSource", required: false },
  { key: "followUpDate", label: "Follow Up Date", required: false },
];

// Mapping shape sent to the server: one sheet header per single-column field, plus
// an ordered list of headers to concatenate into the inquiry's one Notes field —
// covers sheets that split contact history across several columns (Status, per-round
// followup notes, etc.) without hardcoding their names.
export type ImportMapping = Partial<Record<ImportFieldKey, string>> & { notes: string[] };

// Candidate spellings per field, used only to seed a starting guess (see
// suggestMapping below) — never to silently decide the mapping. Every suggestion
// lands in an ordinary <Select>/checkbox the user can freely change before import.
const FIELD_ALIASES: Record<ImportFieldKey, string[]> = {
  date: ["date", "inquiry date", "created date", "created", "lead date"],
  phone: ["phone number", "phone", "mobile", "mobile number", "contact number", "whatsapp number", "whatsapp"],
  fullName: ["full name", "name", "customer name", "contact name", "lead name"],
  email: ["email", "email address", "e mail", "mail"],
  stage: ["stage", "pipeline stage", "lead stage"],
  source: ["source", "channel", "lead source"],
  subSource: ["subsource", "sub source", "sub channel", "channel detail"],
  followUpDate: ["follow up date", "followup date", "next follow up", "next follow up date", "callback date"],
};

// Header text that hints "this is free-form contact history", not a distinct
// field — pre-checked in the Notes list rather than left for the user to notice.
const NOTES_HINTS = ["note", "remark", "comment", "status", "followup", "extra"];

function normalizeForMatch(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]!
          : 1 + Math.min(prev[j - 1]!, prev[j]!, cur[j - 1]!);
    }
    prev = cur;
  }
  return prev[b.length]!;
}

// 0 (unrelated) .. 1 (identical). Edit-distance ratio, boosted when one string
// contains the other — catches "Contact Number" vs. alias "phone number" even
// though their edit distance alone is large.
function similarity(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  const editSim = 1 - dist / maxLen;
  const containment = a.includes(b) || b.includes(a) ? 0.25 : 0;
  return Math.min(1, editSim + containment);
}

const MATCH_THRESHOLD = 0.55;

// Fuzzy-suggests a starting mapping from a sheet's real header row: scores every
// (field, header) pair against that field's known aliases (typo/synonym tolerant
// via edit distance), then greedily assigns each field to its best still-free
// header. Leftover headers that look note-ish get pre-checked as Notes columns.
// Everything here is a suggestion — the caller seeds editable UI state with it.
export function suggestMapping(headers: string[]): { fields: Partial<Record<ImportFieldKey, string>>; notes: string[] } {
  const headerNorms = headers.map(normalizeForMatch);
  const candidates: { field: ImportFieldKey; headerIdx: number; score: number }[] = [];
  for (const field of Object.keys(FIELD_ALIASES) as ImportFieldKey[]) {
    const aliases = FIELD_ALIASES[field];
    headerNorms.forEach((hn, idx) => {
      let best = 0;
      for (const alias of aliases) best = Math.max(best, similarity(hn, alias));
      if (best >= MATCH_THRESHOLD) candidates.push({ field, headerIdx: idx, score: best });
    });
  }
  candidates.sort((a, b) => b.score - a.score);

  const fields: Partial<Record<ImportFieldKey, string>> = {};
  const claimed = new Set<number>();
  for (const c of candidates) {
    if (fields[c.field] || claimed.has(c.headerIdx)) continue;
    fields[c.field] = headers[c.headerIdx];
    claimed.add(c.headerIdx);
  }

  const notes: string[] = [];
  headerNorms.forEach((hn, idx) => {
    if (claimed.has(idx)) return;
    if (NOTES_HINTS.some((w) => hn.includes(w))) notes.push(headers[idx]!);
  });

  return { fields, notes };
}

// Sheet "Stage" cell (case-insensitive, normalized) -> the app's actual pipeline
// stage. Anything not listed here defaults to "new" and is flagged in the import
// results so staff can spot-check and correct it manually.
export const STAGE_MAP: Record<string, InquiryStage> = {
  lead: "new",
  new: "new",
  contacted: "contacted",
  quoted: "quoted",
  "quote sent": "quoted",
  "follow up": "follow_up",
  followup: "follow_up",
  subscribed: "converted",
  converted: "converted",
  customer: "converted",
  lost: "lost",
  "not interested": "lost",
  rejected: "lost",
  "closed lost": "lost",
};
