/**
 * One-time data moves for the unified inquiry pipeline (design: unified-inquiry-pipeline.md, section 6).
 * Idempotent: a re-run finds nothing left to do. Dry run by default — prints a CSV per step, writes nothing.
 *
 *   pnpm --filter tiffin-grab exec tsx scripts/inquiries-merge.ts [--apply] [--step=merge|create|backfill|copy] [--allow-remote]
 *
 * Back up the database before --apply. A non-local DATABASE_URL is refused unless --allow-remote is given.
 * Writes go straight to the tables (no session), so audit columns stay null.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { isLocalDb } from "../db/is-local-db";
import { inquiries, inquiryActivities, leadSources, orders, renewalActivities, renewals, users } from "../db/schema";
import { databaseUrl } from "../lib/runtime/env";
import { fillPlan, groupConflict, groupInquiries, pickWinner, type MergeRow } from "../lib/inquiries/merge-plan";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const stepArg = [...args].find((a) => a.startsWith("--step="))?.slice("--step=".length);
const STEPS = ["merge", "create", "backfill", "copy"] as const;
type Step = (typeof STEPS)[number];
const run = (s: Step) => !stepArg || stepArg === s;

const csv = (...cells: unknown[]) => console.log(cells.map((c) => (c == null ? "" : String(c).replaceAll(",", ";"))).join(","));
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
const ROUND_EVENTS = ["converted", "renewed"] as const;

async function loadRows(): Promise<MergeRow[]> {
  const rows = await db
    .select({
      row: inquiries,
      latest: sql<number>`coalesce((select max(${inquiryActivities.createdAt}) from ${inquiryActivities} where ${inquiryActivities.inquiryId} = ${inquiries.id}), 0)`,
    })
    .from(inquiries);
  return rows.map(({ row, latest }) => ({ ...row, latestActivityAt: Number(latest) }));
}

async function stepMerge() {
  csv("step", "group", "winner", "losers", "note");
  const rows = await loadRows();
  const groups = groupInquiries(rows);
  const inGroup = new Map<bigint, number>();
  groups.forEach((g, i) => g.forEach((r) => inGroup.set(r.id, i)));
  for (const [i, group] of groups.entries()) {
    // Rows tied to different customers or Meta leads are different people sharing a contact (a household).
    const conflict = groupConflict(group);
    if (conflict) {
      csv("merge", i + 1, "", group.map((r) => r.publicId).join(" "), `skipped: ${conflict}`);
      continue;
    }
    const winner = pickWinner(group);
    const losers = group.filter((r) => r.id !== winner.id);
    // Identifiers held by rows outside this group must not be copied onto the winner.
    const held = new Set(
      rows.filter((r) => inGroup.get(r.id) !== i).flatMap((r) => [r.phone, r.whatsappPhone, r.email].filter((v): v is string => !!v).map((v) => v.toLowerCase())),
    );
    const plan = fillPlan(winner, losers, held);
    const owners = new Set(group.map((r) => String(r.currentOwner ?? "")));
    csv("merge", i + 1, winner.publicId, losers.map((l) => l.publicId).join(" "), owners.size > 1 ? "different owners" : "");
    if (!APPLY) continue;
    await db.transaction(async (tx) => {
      const loserIds = losers.map((l) => l.id);
      await tx.update(inquiryActivities).set({ inquiryId: winner.id }).where(inArray(inquiryActivities.inquiryId, loserIds));
      // Delete first: the losers still hold the identifiers the fill may move.
      await tx.delete(inquiries).where(inArray(inquiries.id, loserIds));
      if (Object.keys(plan).length) await tx.update(inquiries).set(plan).where(eq(inquiries.id, winner.id));
      await tx.insert(inquiryActivities).values({
        inquiryId: winner.id,
        type: "merged",
        note: `Merged ${losers.length} duplicate inquir${losers.length === 1 ? "y" : "ies"}: ${losers.map((l) => l.publicId).join(", ")}`,
        details: { merged: losers.map((l) => l.publicId), snapshot: json(losers) },
        orderId: winner.currentOrderId as bigint | null,
      });
    });
  }
  return groups.length;
}

/** Customers matched by contact: user ids per inquiry (more than one means skip). */
async function usersByContact(inq: { email: string | null; phone: string | null }) {
  const who = [
    inq.email ? sql`lower(${users.email}) = ${inq.email.toLowerCase()}` : null,
    inq.phone ? sql`${users.phone} = ${inq.phone}` : null,
  ].filter((p) => p != null);
  if (!who.length) return [];
  return db.select({ id: users.id }).from(users).where(and(eq(users.isSystem, false), sql.join(who, sql` or `)));
}

async function stepCreate() {
  csv("step", "customer", "email", "first_order_at");
  const [web] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, "website"));
  const buyers = await db
    .select({
      id: users.id, name: users.name, email: users.email, phone: users.phone, firstAt: sql<number>`min(${orders.createdAt})`,
      // The first order's org and owner, so the new row is visible to that franchise and has an owner.
      orgId: sql<string | null>`(array_agg(${orders.organizationId} order by ${orders.createdAt}))[1]`,
      ownerId: sql<string | null>`(array_agg(${orders.currentOwner} order by ${orders.createdAt}))[1]`,
    })
    .from(users)
    .innerJoin(orders, eq(orders.userId, users.id))
    .where(eq(users.isSystem, false))
    .groupBy(users.id);
  let created = 0;
  for (const b of buyers) {
    const [byCustomer] = await db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.customerId, b.id)).limit(1);
    if (byCustomer) continue;
    const contact = [
      b.email ? sql`lower(${inquiries.email}) = ${b.email.toLowerCase()}` : null,
      b.phone ? sql`(${inquiries.phone} = ${b.phone} or ${inquiries.whatsappPhone} = ${b.phone})` : null,
    ].filter((p) => p != null);
    if (contact.length) {
      const [byContact] = await db.select({ id: inquiries.id }).from(inquiries).where(sql.join(contact, sql` or `)).limit(1);
      if (byContact) continue;
    }
    created++;
    csv("create", b.id, b.email, b.firstAt);
    if (!APPLY) continue;
    const [inq] = await db
      .insert(inquiries)
      .values({
        fullName: b.name ?? b.email, email: b.email, phone: b.phone, sourceId: web.id, customerId: b.id, stage: "new", createdAt: Number(b.firstAt),
        organizationId: b.orgId, currentOwner: b.ownerId != null ? BigInt(b.ownerId) : null,
      })
      .returning({ id: inquiries.id });
    await db.insert(inquiryActivities).values({ inquiryId: inq.id, type: "created", toStage: "new", details: { origin: "backfill", source: "website" }, createdAt: Number(b.firstAt) });
  }
  return created;
}

async function stepBackfill() {
  csv("step", "inquiry", "change");
  let changes = 0;
  const rows = await db.select().from(inquiries);
  for (const inq of rows) {
    let customerId = inq.customerId;
    if (customerId == null) {
      const matched = await usersByContact(inq);
      if (matched.length === 1) {
        customerId = matched[0].id;
        csv("backfill", inq.publicId, `customer_id=${customerId}`);
        changes++;
        if (APPLY) await db.update(inquiries).set({ customerId }).where(eq(inquiries.id, inq.id));
      } else if (matched.length > 1) {
        csv("backfill", inq.publicId, `skipped: ${matched.length} users match`);
      }
    }
    if (customerId == null) continue;
    const custOrders = await db
      .select({ id: orders.id, status: orders.status, createdAt: orders.createdAt, trialLength: orders.trialLength })
      .from(orders)
      .where(eq(orders.userId, customerId))
      .orderBy(asc(orders.createdAt));
    const live = custOrders.filter((o) => o.status !== "cancelled");
    if (!live.length) continue;
    const newest = live.at(-1)!;
    if (inq.currentOrderId == null) {
      csv("backfill", inq.publicId, `current_order_id=${newest.id}`);
      changes++;
      if (APPLY) await db.update(inquiries).set({ currentOrderId: newest.id }).where(eq(inquiries.id, inq.id));
    }
    if (inq.stage !== "converted") {
      const subStatus = live[0].trialLength != null ? "took_trial" : "took_plan";
      csv("backfill", inq.publicId, `converted (${subStatus})`);
      changes++;
      if (APPLY) await db.update(inquiries).set({ stage: "converted", subStatus, nextFollowUpAt: null }).where(eq(inquiries.id, inq.id));
    }
    // Round events so analytics can count history: the first order is the sale, every later one a renewal.
    const have = await db
      .select({ orderId: inquiryActivities.orderId, type: inquiryActivities.type })
      .from(inquiryActivities)
      .where(and(eq(inquiryActivities.inquiryId, inq.id), inArray(inquiryActivities.type, ROUND_EVENTS)));
    const unstampedConverted = have.find((h) => h.type === "converted" && h.orderId == null);
    if (unstampedConverted && APPLY) {
      await db.update(inquiryActivities).set({ orderId: inq.convertedOrderId ?? live[0].id })
        .where(and(eq(inquiryActivities.inquiryId, inq.id), eq(inquiryActivities.type, "converted"), isNull(inquiryActivities.orderId)));
    }
    const seen = new Set(have.map((h) => String(h.orderId ?? (unstampedConverted ? inq.convertedOrderId ?? live[0].id : ""))));
    // Every order followed by a later one came due: a renewal_started on it keeps history's renewal rate honest.
    const started = new Set(
      (await db.select({ orderId: inquiryActivities.orderId }).from(inquiryActivities)
        .where(and(eq(inquiryActivities.inquiryId, inq.id), eq(inquiryActivities.type, "renewal_started")))).map((r) => String(r.orderId)),
    );
    for (const o of live.slice(0, -1)) {
      if (started.has(String(o.id))) continue;
      csv("backfill", inq.publicId, `renewal_started event for order ${o.id}`);
      changes++;
      if (APPLY) await db.insert(inquiryActivities).values({ inquiryId: inq.id, type: "renewal_started", orderId: o.id, details: { origin: "backfill" }, createdAt: o.createdAt });
    }
    for (const [i, o] of live.entries()) {
      if (seen.has(String(o.id))) continue;
      const type = i === 0 ? "converted" : "renewed";
      csv("backfill", inq.publicId, `${type} event for order ${o.id}`);
      changes++;
      if (APPLY) await db.insert(inquiryActivities).values({ inquiryId: inq.id, type, orderId: o.id, details: { origin: "backfill" }, createdAt: o.createdAt });
    }
  }
  return changes;
}

async function stepCopy() {
  csv("step", "renewal_order", "inquiry", "change");
  const rows = await db.select({ r: renewals, userId: orders.userId }).from(renewals).innerJoin(orders, eq(orders.id, renewals.orderId));
  let copied = 0;
  for (const { r, userId } of rows) {
    const [byPointer] = await db.select().from(inquiries).where(eq(inquiries.currentOrderId, r.orderId)).limit(1);
    const inq = byPointer ?? (userId != null ? (await db.select().from(inquiries).where(eq(inquiries.customerId, userId)).limit(1))[0] : undefined);
    if (!inq) throw new Error(`renewal for order ${r.orderId} has no inquiry — run --step=create and --step=backfill first`);
    if (inq.currentOrderId === r.orderId && inq.renewalStatus == null && r.status && r.status !== "renewed") {
      csv("copy", r.orderId, inq.publicId, `renewal_status=${r.status}`);
      copied++;
      if (APPLY) {
        await db.update(inquiries).set({
          renewalStatus: r.status,
          renewalStatusSource: "staff",
          renewalStatusSetAt: r.statusSetAt,
          renewalFollowUpAt: r.nextFollowUpAt,
          renewalLostReason: r.lostReason,
        }).where(eq(inquiries.id, inq.id));
      }
    }
    const acts = await db.select().from(renewalActivities).where(eq(renewalActivities.renewalId, r.id));
    for (const a of acts) {
      const [done] = await db
        .select({ id: inquiryActivities.id })
        .from(inquiryActivities)
        .where(sql`${inquiryActivities.details}->>'renewalActivityId' = ${a.publicId}`)
        .limit(1);
      if (done) continue;
      csv("copy", r.orderId, inq.publicId, `activity ${a.type}`);
      copied++;
      if (!APPLY) continue;
      await db.insert(inquiryActivities).values({
        inquiryId: inq.id,
        orderId: r.orderId,
        type: a.type === "status_change" ? "stage_change" : a.type,
        note: a.note,
        outcome: a.outcome,
        nextFollowUpAt: a.nextFollowUpAt,
        lostReason: a.type === "status_change" && a.toStatus === "not_renewed" ? r.lostReason : null,
        details: { renewalActivityId: a.publicId, ...(a.type === "status_change" ? { renewalStatusFrom: a.fromStatus, renewalStatusTo: a.toStatus } : {}) },
        createdAt: a.createdAt,
        createdBy: a.createdBy,
      });
    }
  }
  return copied;
}

async function main() {
  if (!isLocalDb(databaseUrl()) && !args.has("--allow-remote")) {
    throw new Error("Refusing a non-local DATABASE_URL without --allow-remote. Back up first.");
  }
  if (stepArg && !STEPS.includes(stepArg as Step)) throw new Error(`Unknown --step=${stepArg}`);
  console.error(APPLY ? "APPLY: writing changes" : "Dry run: no writes (pass --apply to write)");
  const summary: Record<string, number> = {};
  if (run("merge")) summary.mergeGroups = await stepMerge();
  if (run("create")) summary.created = await stepCreate();
  if (run("backfill")) summary.backfilled = await stepBackfill();
  if (run("copy")) summary.copied = await stepCopy();
  console.error(JSON.stringify(summary));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
