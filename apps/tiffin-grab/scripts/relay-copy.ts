/**
 * One-off, idempotent copy of email data from the TiffinGrab database into Relay. Data correction, so a script,
 * never a migration (AGENTS.md "Migrations — strict rules" rule 1). Run by hand, never from CI:
 *
 *   DATABASE_URL=… RELAY_URL=… RELAY_API_KEY=… pnpm --filter tiffin-grab exec tsx scripts/relay-copy.ts --mode=copy|verify
 *
 * Reads are in a read-only session (the connection itself is read-only; no write is issued). Logs counts only:
 * no address, name or message body is printed.
 */
import postgres from "postgres";

type Json = Record<string, unknown>;
export type SkipCounts = Record<string, number>;

const RESULT_REASONS = ["unsubscribe", "bounce", "complaint", "manual"] as const;
export type SuppressionReason = (typeof RESULT_REASONS)[number];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (s: string | null | undefined): s is string => !!s && s.length <= 254 && EMAIL_RE.test(s.trim().toLowerCase());
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 300);
const ms = (v: unknown): number | null => (v == null ? null : Number(v));

/** Old suppression reason text to Relay's four reasons. */
export function mapReason(text: string): SuppressionReason {
  if (/complaint/i.test(text)) return "complaint";
  if (/bounce/i.test(text)) return "bounce";
  if (/unsubscribe/i.test(text)) return "unsubscribe";
  return "manual";
}

/** scope marketing becomes stream marketing; scope all omits the stream (all streams). Non-email rows are skipped. */
export function mapSuppression(r: { address: string; channel: string; scope: string; reason: string }) {
  if (r.channel !== "email" || !isEmail(r.address)) return null;
  const email = r.address.trim().toLowerCase();
  const reason = mapReason(r.reason);
  return r.scope === "marketing" ? { email, reason, stream: "marketing" as const } : { email, reason };
}

/** "First Last Rest" splits at the first space; names are capped at Relay's 80 characters. */
export function splitName(name: string | null): { firstName?: string; lastName?: string } {
  const n = (name ?? "").trim();
  if (!n) return {};
  const at = n.indexOf(" ");
  if (at < 0) return { firstName: n.slice(0, 80) };
  const last = n.slice(at + 1).trim();
  return { firstName: n.slice(0, at).slice(0, 80), ...(last ? { lastName: last.slice(0, 80) } : {}) };
}

/** Phone-only members (no email) cannot be sent to, so they are skipped. */
export function mapMember(r: { email: string | null; name: string | null }) {
  if (!isEmail(r.email)) return null;
  return { email: r.email.trim().toLowerCase(), ...splitName(r.name) };
}

export function mapList(r: { public_id: string; name: string; consent_source: string; consent_note: string | null }) {
  return {
    importRef: r.public_id,
    name: r.name.trim().slice(0, 80),
    consentSource: r.consent_source,
    ...(r.consent_note ? { consentNote: r.consent_note.slice(0, 500) } : {}),
  };
}

export function mapTemplate(r: {
  public_id: string;
  event: string | null;
  locale: string;
  subject: string;
  body: string | null;
  html: string | null;
  text: string | null;
  enabled: boolean;
}) {
  return {
    importRef: r.public_id,
    name: `${r.event ?? "custom"}:${r.locale}`.slice(0, 120),
    event: r.event,
    locale: r.locale,
    subject: oneLine(r.subject),
    intro: r.body,
    html: r.html ?? "",
    text: r.text ?? "",
    enabled: r.enabled,
  };
}

export function mapCampaignStatus(status: string): "draft" | "sent" | "cancelled" {
  if (status === "completed" || status === "sent") return "sent";
  if (status === "cancelled") return "cancelled";
  return "draft";
}

const COUNTER_KEYS = ["queued", "sent", "failed", "delivered", "opened", "clicked", "bounced", "unsubscribed"] as const;

export function mapCampaign(
  r: { public_id: string; name: string; status: string; audience: Json | null; counts: Json | null },
  content: { subject: string; html: string | null; text: string | null },
  relayListId: (contactListPublicId: string) => string | undefined,
) {
  const listPublicIds = Array.isArray(r.audience?.listIds) ? (r.audience!.listIds as string[]) : [];
  const counters: Record<string, number> = {};
  for (const k of COUNTER_KEYS) {
    const v = r.counts?.[k];
    if (typeof v === "number") counters[k] = v;
  }
  return {
    importRef: r.public_id,
    name: r.name.trim().slice(0, 80),
    status: mapCampaignStatus(r.status),
    fromEmail: null,
    subject: oneLine(content.subject),
    html: content.html ?? "",
    text: content.text ?? "",
    listIds: listPublicIds.map(relayListId).filter((x): x is string => !!x),
    counters,
  };
}

/** Only sent and failed rows are copied; pending and processing rows are still sent by the engine. */
export function mapMessage(r: {
  public_id: string;
  dedupe_key: string | null;
  recipient_email: string | null;
  channel: string;
  kind: string;
  event: string | null;
  status: string;
  payload: Json | null;
  last_error: string | null;
  provider_message_id: string | null;
  created_at: unknown;
  opened_at: unknown;
  clicked_at: unknown;
  delivered_at: unknown;
  bounced_at: unknown;
  complained_at: unknown;
}) {
  if (r.channel !== "email" || (r.status !== "sent" && r.status !== "failed") || !isEmail(r.recipient_email)) return null;
  const subject = typeof r.payload?.subject === "string" ? r.payload.subject : (r.event ?? "");
  return {
    // The engine's stored key already ends in ":email", the key Relay dedupes on: import it as-is.
    importRef: r.dedupe_key ?? `nob:${r.public_id}`,
    toEmail: r.recipient_email.trim().toLowerCase(),
    stream: r.kind === "marketing" ? ("marketing" as const) : ("transactional" as const),
    event: r.event,
    subject: oneLine(subject),
    status: r.status as "sent" | "failed",
    error: r.last_error ? r.last_error.slice(0, 500) : null,
    createdAt: Number(r.created_at),
    sentAt: null,
    sesMessageId: r.provider_message_id ? r.provider_message_id.slice(0, 200) : null,
    opens: r.opened_at ? 1 : 0,
    clicks: r.clicked_at ? 1 : 0,
    deliveredAt: ms(r.delivered_at),
    bouncedAt: ms(r.bounced_at),
    complainedAt: ms(r.complained_at),
  };
}

type Post = (path: string, rows: unknown[]) => Promise<{ created: number; existing: number; ids?: Record<string, string> }>;

const CHUNK = 500;
const MEMBER_CHUNK = 1000;
const chunks = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Runs the copy (or re-runs it for verify: Relay answers existing for rows it already has). Returns per-kind totals. */
export async function run(mode: "copy" | "verify", sql: postgres.Sql, post: Post, log: (line: string) => void) {
  const totals: Record<string, { source: number; created: number; existing: number; skipped: SkipCounts }> = {};
  const kind = (k: string) => (totals[k] ??= { source: 0, created: 0, existing: 0, skipped: {} });
  const skip = (k: string, why: string) => {
    const t = kind(k);
    t.skipped[why] = (t.skipped[why] ?? 0) + 1;
  };
  const send = async (k: string, path: string, rows: unknown[], size: number) => {
    for (const slice of chunks(rows, size)) {
      const res = await post(path, slice);
      kind(k).created += res.created;
      kind(k).existing += res.existing;
    }
  };

  // 1. Suppressions (step 2's unsubscribed members are appended at the end).
  const suppressions = (await sql`select address, channel, scope, reason from message_suppression where channel = 'email'`).map((r) =>
    mapSuppression(r as never),
  );
  kind("suppressions").source = suppressions.length;
  const suppressionRows = suppressions.filter((x): x is NonNullable<typeof x> => x !== null);
  suppressions.forEach((x) => x === null && skip("suppressions", "invalid"));

  // 2. Lists, then members per list. Members are read in keyset pages so a large list never loads at once.
  const lists = await sql`select id, public_id, name, consent_source, consent_note from contact_list order by id`;
  kind("lists").source = lists.length;
  const listRows = lists.map((r) => mapList(r as never));
  const listRefs = new Map<number, string>(lists.map((r) => [Number(r.id), String(r.public_id)]));
  const relayIds: Record<string, string> = {};
  for (const slice of chunks(listRows, CHUNK)) {
    const res = await post("/api/v1/import/lists", slice);
    kind("lists").created += res.created;
    kind("lists").existing += res.existing;
    Object.assign(relayIds, res.ids ?? {});
  }
  const extraUnsub: NonNullable<ReturnType<typeof mapSuppression>>[] = [];
  kind("members").source = 0;
  for (const [listId, publicId] of listRefs) {
    const relayId = relayIds[publicId];
    if (!relayId) continue;
    let after = 0;
    for (;;) {
      const page = await sql`select id, email, phone, name, unsubscribed_at from contact_list_member
        where list_id = ${listId} and id > ${after} order by id limit ${MEMBER_CHUNK}`;
      if (page.length === 0) break;
      after = Number(page[page.length - 1]!.id);
      kind("members").source += page.length;
      const rows: { email: string; firstName?: string; lastName?: string }[] = [];
      for (const m of page) {
        const mapped = mapMember(m as never);
        if (!mapped) {
          skip("members", "no_email");
          continue;
        }
        rows.push(mapped);
        if (m.unsubscribed_at != null) extraUnsub.push({ email: mapped.email, reason: "unsubscribe", stream: "marketing" });
      }
      if (rows.length) await send("members", `/api/v1/lists/${relayId}/import`, rows, MEMBER_CHUNK);
    }
  }
  suppressionRows.push(...extraUnsub);
  kind("suppressions").source += extraUnsub.length;
  await send("suppressions", "/api/v1/import/suppressions", suppressionRows, CHUNK);

  // 3. Templates (email rows only; in_app rows stay local).
  const templates = await sql`select public_id, event, locale, subject, body, html, text, enabled from notification_template where channel = 'email'`;
  kind("templates").source = templates.length;
  await send("templates", "/api/v1/import/templates", templates.map((r) => mapTemplate(r as never)), CHUNK);

  // 4. Campaigns (system campaigns skipped) with their en/email content.
  const campaigns = await sql`select public_id, name, status, audience, counts, id from campaign where system_key is null order by id`;
  kind("campaigns").source = campaigns.length;
  const campaignRows: ReturnType<typeof mapCampaign>[] = [];
  for (const c of campaigns) {
    const [content] = await sql`select subject, html, text from campaign_content
      where campaign_id = ${c.id} and channel = 'email' and locale = 'en' limit 1`;
    if (!content) {
      skip("campaigns", "no_content");
      continue;
    }
    campaignRows.push(
      mapCampaign(c as never, content as never, (pub) => {
        return relayIds[pub];
      }),
    );
  }
  await send("campaigns", "/api/v1/import/campaigns", campaignRows, CHUNK);

  // 5. Message history (sent and failed email rows, keyset pages).
  let after = 0;
  for (;;) {
    const page = await sql`select id, public_id, dedupe_key, recipient_email, channel, kind, event, status, payload, last_error,
        provider_message_id, created_at, opened_at, clicked_at, delivered_at, bounced_at, complained_at
      from notification_outbox where channel = 'email' and id > ${after} order by id limit ${CHUNK}`;
    if (page.length === 0) break;
    after = Number(page[page.length - 1]!.id);
    kind("messages").source += page.length;
    const rows: unknown[] = [];
    for (const r of page) {
      if (r.status === "pending" || r.status === "processing") skip("messages", r.status as string);
      const mapped = mapMessage(r as never);
      if (mapped) rows.push(mapped);
      else if (r.status !== "pending" && r.status !== "processing") skip("messages", "invalid");
    }
    if (rows.length) await send("messages", "/api/v1/import/messages", rows, CHUNK);
  }

  for (const [k, t] of Object.entries(totals)) {
    log(JSON.stringify({ mode, kind: k, ...t }));
  }
  return totals;
}

async function post(path: string, rows: unknown[]) {
  const base = process.env.RELAY_URL;
  const key = process.env.RELAY_API_KEY;
  if (!base || !key) throw new Error("RELAY_URL and RELAY_API_KEY are required");
  const res = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(`relay ${path} failed: ${res.status}`);
  return ((await res.json()) as { data: { created: number; existing: number; ids?: Record<string, string> } }).data;
}

async function main() {
  const mode = process.argv.find((a) => a.startsWith("--mode="))?.slice("--mode=".length) ?? "copy";
  if (mode !== "copy" && mode !== "verify") throw new Error("--mode must be copy or verify");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  // Read-only session: the server refuses writes, and the script issues none.
  const sql = postgres(url, { max: 1, prepare: false, connection: { options: "-c default_transaction_read_only=on" } });
  try {
    const totals = await run(mode, sql, post, (line) => console.log(line));
    const bad = Object.entries(totals).filter(([, t]) => t.created + t.existing !== t.source - Object.values(t.skipped).reduce((a, b) => a + b, 0));
    if (mode === "verify" && bad.length) {
      console.error(JSON.stringify({ mismatch: bad.map(([k]) => k) }));
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

// Imported by the unit tests: only the CLI runs main().
const isEntry = typeof require !== "undefined" && typeof module !== "undefined" && require.main === module;
if (isEntry) void main();
