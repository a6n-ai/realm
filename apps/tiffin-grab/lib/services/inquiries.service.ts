import { parseEmail, parsePhone } from "@/lib/services/contact";
import { isUniqueViolation } from "@/lib/db/errors";
import { LIVE } from "@/lib/orders/status";
import { orderStatusIn } from "@/lib/orders/status-sql";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { BaseRepository, UpdatableRepository, conditionToSql, columnResolver, pageOrder } from "@foundry/database";
import { ValidationError, phoneSchema, emailSchema } from "@foundry/commons";
import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import type { PageRequest } from "@foundry/commons/util/pagination";
import { and, asc, desc, eq, getTableColumns, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryZones, inquiries, inquiryActivities, leadCounters, leadSources, leadSubsources, orders, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { assertServiceable, findZone } from "@/lib/catalog/zone-match";
import { parseCanadianPostalCode } from "@/lib/catalog/postal";
import { SessionBaseService, SessionUpdatableService } from "./session-service";
import { assertOnePerson, createOrder, type CreateOrderInput } from "./create-order";
import { getBrandOrgId } from "./organizations.service";
import { getLeadAssignment, setLeadAssignment } from "./app-settings.service";
import { pickAssignee, strategyFor } from "./assignment";
import { poolFor } from "./owner-pool.service";
import { assertReassignAllowed, resolveAssignableOwner } from "./reassign";
import type { SortState } from "@foundry/design-system/list-sort";
import { generatedLeadName, isQuickAdd } from "@/lib/inquiries/quick-add";
import { SUB_STATUSES, SUB_STATUS_META, assertTransition, groupFor, isClosed, stageFor, type SubStatus } from "@/lib/inquiries/status";

/** Reject inquiry→order convert when this phone already has a live subscription. */
async function assertNoLiveOrderForPhone(phone: string): Promise<void> {
  const trimmed = phone.trim();
  if (!trimmed) return;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, trimmed))
    .limit(1);
  if (!user) return;
  const [live] = await db
    .select({ deploymentId: orders.deploymentId, status: orders.status })
    .from(orders)
    .where(and(eq(orders.userId, user.id), orderStatusIn(LIVE)))
    .limit(1);
  if (live) {
    throw new ValidationError(
      `This customer already has a ${live.status} order (${live.deploymentId}). Open that order instead of converting again.`,
    );
  }
}

export type PipelineSortColumn =
  | "name"
  | "owner"
  | "stage"
  | "source"
  | "lastTouch"
  | "nextAction"
  | "nextFollowUp"
  | "created";

export type QueueTab = "due" | "overdue" | "upcoming" | "open" | "closed" | "quick";

const openSql = sql`${inquiries.stage} not in ('converted', 'lost')`;

/** SQL twin of isQuickAdd (lib/inquiries/quick-add.ts): open, generated name not yet replaced. */
export const quickAddSql = sql`(${openSql} and ${inquiries.leadNumber} is not null and ${inquiries.fullName} = 'Lead ' || ${inquiries.leadNumber})`;

/** Same buckets as the Inquiries KPI cards. `all` is their union (null sub-status on a closed stage is in none of them). */
export const INQUIRY_BUCKETS = ["lead", "follow_up", "took", "lost"] as const;
export type InquiryBucket = (typeof INQUIRY_BUCKETS)[number];

const inquirySubs = (f: (s: SubStatus) => boolean) => inArray(inquiries.subStatus, SUB_STATUSES.filter(f));

export function inquiryBucketWhere(bucket: InquiryBucket | "all"): SQL {
  const one = (b: InquiryBucket): SQL => {
    switch (b) {
      case "lead":
        return or(
          and(isNull(inquiries.subStatus), notInArray(inquiries.stage, ["converted", "lost"])),
          inquirySubs((s) => !isClosed(s) && groupFor(s) === "lead"),
        )!;
      case "follow_up":
        return inquirySubs((s) => !isClosed(s) && groupFor(s) === "follow_up");
      case "took":
        return inquirySubs((s) => s === "took_plan" || s === "took_trial");
      case "lost":
        return inquirySubs((s) => s === "lost" || s === "undeliverable");
      default: {
        const unreachable: never = b;
        return unreachable;
      }
    }
  };
  if (bucket === "all") return or(...INQUIRY_BUCKETS.map(one))!;
  return one(bucket);
}

function queuePredicate(tab: QueueTab, dayStart: number, dayEnd: number): SQL {
  const next = inquiries.nextFollowUpAt;
  switch (tab) {
    case "due": return sql`(${openSql} and (${next} is null or (${next} >= ${dayStart} and ${next} < ${dayEnd})))`;
    case "overdue": return sql`(${openSql} and ${next} < ${dayStart})`;
    case "upcoming": return sql`(${openSql} and ${next} >= ${dayEnd})`;
    case "open": return openSql;
    case "closed": return sql`not (${openSql})`;
    case "quick": return quickAddSql;
  }
}

type Stage = (typeof inquiries.stage.enumValues)[number];
type ActivityType =
  | "call" | "whatsapp" | "email" | "note"
  | "quote_sent" | "sample_sent" | "payment_link_sent" | "visit" | "callback";
type LostReason = (typeof inquiries.lostReason.enumValues)[number];

const newWhere = (visible: "all" | string[]) =>
  and(eq(inquiries.stage, "new"), visible === "all" ? undefined : inArray(inquiries.organizationId, visible));

function assertFiniteFollowUp(at: number | null | undefined) {
  if (at != null && !Number.isFinite(at)) throw new ValidationError("Invalid follow-up date");
}

export function computeOverdue(stage: string, nextFollowUpAt: number | null, now: number): boolean {
  if (nextFollowUpAt == null) return false;
  if (stage === "converted" || stage === "lost") return false;
  return nextFollowUpAt < now;
}

// Field → base-table column. Every filterable facet lives on the base `inquiries`
// row; the leadSources/users joins in `list` are display-only. The FK facets
// (owner/source/subsource) carry readable public ids / keys in the URL, resolved
// to internal ids via a scalar subquery so no internal id ever leaks into a link.
function inquiriesResolver() {
  const base = columnResolver({
    stage: inquiries.stage,
    lostReason: inquiries.lostReason,
    createdAt: inquiries.createdAt,
    fullName: inquiries.fullName,
    phone: inquiries.phone,
    email: inquiries.email,
  });
  const valuesOf = (f: FilterCondition) =>
    f.operator === "in" ? (f.value as string[]) : [f.value as string];
  return (f: FilterCondition) => {
    if (f.field === "subStatus") {
      const vals = valuesOf(f);
      const real = vals.filter((v) => v !== "none") as SubStatus[];
      return or(vals.includes("none") ? isNull(inquiries.subStatus) : undefined, real.length ? inArray(inquiries.subStatus, real) : undefined)!;
    }
    if (f.field === "zone") {
      return inArray(inquiries.zoneId, db.select({ id: deliveryZones.id }).from(deliveryZones).where(inArray(deliveryZones.name, valuesOf(f))));
    }
    if (f.field === "owner") {
      return inArray(
        inquiries.currentOwner,
        db.select({ id: users.id }).from(users).where(inArray(users.publicId, valuesOf(f))),
      );
    }
    if (f.field === "source") {
      return inArray(
        inquiries.sourceId,
        db.select({ id: leadSources.id }).from(leadSources).where(inArray(leadSources.key, valuesOf(f))),
      );
    }
    if (f.field === "subsource") {
      return inArray(
        inquiries.subSourceId,
        db.select({ id: leadSubsources.id }).from(leadSubsources).where(inArray(leadSubsources.key, valuesOf(f))),
      );
    }
    return base(f);
  };
}

const isOpenLeadConflict = (e: unknown) => isUniqueViolation(e, /^inquiries_open_(phone|email)_unique$/);

class InquiriesService extends SessionUpdatableService<typeof inquiries> {
  private async resolveSource(sourceKey: string, subSourceKey?: string) {
    const [src] = await db
      .select({ id: leadSources.id, isInbound: leadSources.isInbound })
      .from(leadSources)
      .where(eq(leadSources.key, sourceKey))
      .limit(1);
    if (!src) throw new ValidationError(`Unknown lead source: ${sourceKey}`);
    let subSourceId: bigint | null = null;
    if (subSourceKey) {
      const [sub] = await db
        .select({ id: leadSubsources.id })
        .from(leadSubsources)
        .where(eq(leadSubsources.key, subSourceKey))
        .limit(1);
      subSourceId = sub?.id ?? null;
    }
    return { sourceId: src.id, subSourceId, isInbound: src.isInbound };
  }

  // Owners are always staff. A staff member adding a lead owns it; anything else
  // (website form, a signed-in customer subscribing) is assigned from the pool —
  // per-source, then default, then every active staff member.
  private async resolveOwner(sourceId: bigint, sourceKey: string): Promise<bigint> {
    const actor = await this.currentUserId();
    if (actor && (await this.isActiveStaff(actor))) return actor;
    const cfg = await getLeadAssignment();
    // "creator" has no staff creator to fall back on here, so it rotates instead.
    const strat = strategyFor(cfg, sourceKey) === "percentage" ? "percentage" : "round_robin";
    const sourcePool = await poolFor("inquiry", sourceId);
    const configured = sourcePool.length ? sourcePool : await poolFor("inquiry");
    const pool = configured.length ? configured : await this.activeStaffPool();
    if (!pool.length) return this.systemUserId();

    const roll = await this.rollFor();
    const { chosen, cursorPublicId } = pickAssignee(strat, pool, cfg, sourceKey, roll);
    if (!chosen) return this.systemUserId();
    if (strat === "round_robin" && cursorPublicId) {
      await setLeadAssignment({ ...cfg, cursor: { ...cfg.cursor, [sourceKey]: cursorPublicId } });
    }
    return chosen.id;
  }

  private staffWhere() {
    return and(eq(users.isSystem, false), eq(users.status, "active"), inArray(users.role, STAFF_ROLES));
  }

  private async isActiveStaff(userId: bigint): Promise<boolean> {
    const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), this.staffWhere())).limit(1);
    return !!u;
  }

  private async activeStaffPool() {
    return db.select({ id: users.id, publicId: users.publicId, weight: sql<number>`1` }).from(users).where(this.staffWhere());
  }

  private async systemUserId(): Promise<bigint> {
    const [sys] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
    if (!sys) throw new Error("system user not seeded");
    return sys.id;
  }

  private async rollFor(): Promise<number> {
    // percentage strategy only; derive from current epoch ms fractional — adequate for weighting
    return (Date.now() % 1000) / 1000;
  }

  private async resolveZoneId(postalCode?: string): Promise<bigint | null> {
    if (!postalCode) return null;
    const { zones } = await loadCatalogSnapshot();
    return (await findZone(zones, { postalCode }))?.id ?? null;
  }

  /**
   * One open inquiry per person: a phone OR email match on an open (not
   * converted/lost) inquiry is the same person. Email wins when phone and email
   * point at different inquiries — email is the login identity. Newest first.
   */
  async findOpenMatch(
    phone: string | null,
    email?: string | null,
    excludeId?: bigint,
    whatsappPhone?: string | null,
  ): Promise<typeof inquiries.$inferSelect | null> {
    // A number matches either stored number: people often enquire from WhatsApp on a different phone.
    const numbers = [...new Set([phone, whatsappPhone].filter((n): n is string => !!n).map((n) => n.toLowerCase()))];
    const parts = [
      ...numbers.flatMap((n) => [eq(sql`lower(${inquiries.phone})`, n), eq(sql`lower(${inquiries.whatsappPhone})`, n)]),
      email ? eq(sql`lower(${inquiries.email})`, email.toLowerCase()) : undefined,
    ].filter((p): p is SQL => !!p);
    if (!parts.length) return null;
    const match = or(...parts)!;
    const rows = await db
      .select()
      .from(inquiries)
      .where(and(match, notInArray(inquiries.stage, ["converted", "lost"]), excludeId != null ? ne(inquiries.id, excludeId) : undefined))
      .orderBy(desc(inquiries.createdAt));
    const byEmail = email ? rows.find((r) => r.email?.toLowerCase() === email.toLowerCase()) : undefined;
    return byEmail ?? rows[0] ?? null;
  }

  /** A repeat contact from the same person: log it on their open inquiry instead of a new row. */
  private async logReinquiry(
    inq: typeof inquiries.$inferSelect,
    v: { phone: string | null; email: string | null; sourceKey: string; subSourceKey?: string; notes?: unknown },
  ) {
    const [src] = await db.select({ label: leadSources.label }).from(leadSources).where(eq(leadSources.key, v.sourceKey)).limit(1);
    const parts = [`Re-inquiry via ${src?.label ?? v.sourceKey}${v.subSourceKey ? ` (${v.subSourceKey})` : ""}`];
    if (v.phone && (inq.phone ?? "").toLowerCase() !== v.phone.toLowerCase()) parts.push(`phone ${v.phone}`);
    if (v.email && (inq.email ?? "").toLowerCase() !== v.email.toLowerCase()) parts.push(`email ${v.email}`);
    const message = typeof v.notes === "string" && v.notes.trim() ? `\n${v.notes.trim()}` : "";
    await inquiryActivitiesService.create({ inquiryId: inq.id, type: "reinquiry", note: parts.join(" · ") + message });
  }

  /** Next never-resetting "Lead <n>" number for the org. Atomic; a failed insert just skips a number. */
  private async nextLeadNumber(organizationId: string | null): Promise<number> {
    const [row] = await db
      .insert(leadCounters)
      .values({ orgKey: organizationId ?? "", lastNumber: 1 })
      .onConflictDoUpdate({ target: leadCounters.orgKey, set: { lastNumber: sql`${leadCounters.lastNumber} + 1` } })
      .returning({ n: leadCounters.lastNumber });
    return row.n;
  }

  /** Creates the inquiry, or folds it into the person's open one (see findOpenMatch). */
  async createOrFold(values: Record<string, unknown>): Promise<{ inquiry: typeof inquiries.$inferSelect; folded: boolean }> {
    const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    let fullName = clean(values.fullName);
    const rawPhone = clean(values.phone);
    const rawWhatsapp = clean(values.whatsappPhone);
    const rawEmail = clean(values.email);
    if (!fullName && !rawPhone) throw new ValidationError("Enter a name or phone number");
    let phone: string | null = null;
    if (rawPhone) {
      phone = parsePhone(rawPhone);
    }
    const whatsappPhone = rawWhatsapp ? parsePhone(rawWhatsapp) : null;
    let email: string | null = null;
    if (rawEmail) {
      email = parseEmail(rawEmail);
    }

    const { sourceKey, subSourceKey, subStatus: rawSub, whatsappPhone: _wa, ...rest } = values as {
      sourceKey: string;
      subSourceKey?: string;
      subStatus?: unknown;
      [k: string]: unknown;
    };
    const subStatus = (rawSub ?? null) as SubStatus | null;
    if (subStatus !== null && !(SUB_STATUSES.includes(subStatus) && SUB_STATUS_META[subStatus].pickable && !isClosed(subStatus))) {
      throw new ValidationError("Pick an open starting status");
    }
    const fold = async (existing: typeof inquiries.$inferSelect) => {
      await this.logReinquiry(existing, { phone, email, sourceKey, subSourceKey, notes: rest.notes });
      return { inquiry: existing, folded: true };
    };

    const existing = await this.findOpenMatch(phone, email, undefined, whatsappPhone);
    if (existing) return fold(existing);

    // Zone resolution depends only on the postal code, so run it alongside the
    // source→owner chain instead of after it.
    const zoneIdP = this.resolveZoneId(rest.postalCode as string | undefined);
    const { sourceId, subSourceId } = await this.resolveSource(sourceKey, subSourceKey);
    const currentOwner = await this.resolveOwner(sourceId, sourceKey);
    const zoneId = await zoneIdP;
    // Stamped like orders (getBrandOrgId): left null, the lead drops out of every org-scoped analytics view.
    const organizationId = await getBrandOrgId(db);
    let leadNumber: number | null = null;
    if (!fullName) {
      leadNumber = await this.nextLeadNumber(organizationId);
      fullName = generatedLeadName(leadNumber);
    }

    let inq: typeof inquiries.$inferSelect;
    try {
      inq = await super.create({
        ...rest,
        fullName,
        leadNumber,
        phone,
        whatsappPhone,
        email,
        stage: stageFor(subStatus),
        subStatus,
        nextFollowUpAt: typeof rest.nextFollowUpAt === "number" ? rest.nextFollowUpAt : null,
        sourceId,
        subSourceId,
        currentOwner,
        zoneId,
        organizationId,
      });
    } catch (e) {
      // Partial unique indexes inquiries_open_{phone,email}_unique: a concurrent
      // insert for the same person won the race — fold into it (the dedup rule,
      // enforced at the DB).
      if (isOpenLeadConflict(e)) {
        const winner = await this.findOpenMatch(phone, email, undefined, whatsappPhone);
        if (winner) return fold(winner);
      }
      throw e;
    }
    await inquiryActivitiesService.create({
      inquiryId: inq.id,
      type: "created",
      toStage: inq.stage,
      toSubStatus: subStatus,
    });
    return { inquiry: inq, folded: false };
  }

  async create(values: Record<string, unknown>) {
    return (await this.createOrFold(values)).inquiry;
  }

  /**
   * Edits who the lead is. An absent key is unchanged; null/blank clears it. A blank name keeps a
   * generated one, or gets a new "Lead <n>" when a phone remains — a lead always has a name or phone.
   */
  async updateContact(
    publicId: string,
    input: { fullName?: string | null; phone?: string | null; whatsappPhone?: string | null; email?: string | null },
  ): Promise<typeof inquiries.$inferSelect> {
    const inq = await this.read(publicId);
    if (inq.stage === "converted") throw new ValidationError("A converted inquiry cannot be edited");
    const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
    const pick = <K extends keyof typeof input>(k: K, parse: (raw: string) => string, current: string | null) => {
      if (!(k in input)) return current;
      const raw = clean(input[k]);
      return raw ? parse(raw) : null;
    };
    const phone = pick("phone", parsePhone, inq.phone);
    const whatsappPhone = pick("whatsappPhone", parsePhone, inq.whatsappPhone);
    const email = pick("email", parseEmail, inq.email);

    let fullName = "fullName" in input ? clean(input.fullName) : inq.fullName;
    let leadNumber = inq.leadNumber;
    if (!fullName) {
      if (isQuickAdd(inq)) fullName = inq.fullName;
      else if (phone) {
        leadNumber = await this.nextLeadNumber(inq.organizationId);
        fullName = generatedLeadName(leadNumber);
      } else throw new ValidationError("Enter a name or phone number");
    }

    const other = await this.findOpenMatch(phone, email, inq.id, whatsappPhone);
    const collision = (o: { publicId: string }) =>
      new ValidationError(`Another open lead has this phone or email (${o.publicId}). Open that lead instead.`);
    if (other) throw collision(other);

    const labels = { fullName: "Name", phone: "Phone", whatsappPhone: "WhatsApp", email: "Email" } as const;
    const next = { fullName, phone, whatsappPhone, email };
    const changes = (Object.keys(labels) as (keyof typeof labels)[])
      .filter((k) => (inq[k] ?? null) !== (next[k] ?? null))
      .map((k) => `${labels[k]} changed from ${inq[k] ?? "blank"} to ${next[k] ?? "blank"}`);
    if (!changes.length) return inq;

    try {
      await this.update(publicId, { ...next, leadNumber });
    } catch (e) {
      if (isOpenLeadConflict(e)) {
        const winner = await this.findOpenMatch(phone, email, inq.id, whatsappPhone);
        if (winner) throw collision(winner);
      }
      throw e;
    }
    await inquiryActivitiesService.create({ inquiryId: inq.id, type: "note", note: changes.join(" · ") });
    return this.read(publicId);
  }

  async addNote(publicId: string, note: string, nextFollowUpAt?: number) {
    assertFiniteFollowUp(nextFollowUpAt);
    const inq = await this.read(publicId);
    await inquiryActivitiesService.create({
      inquiryId: inq.id,
      type: "note",
      note,
      nextFollowUpAt: nextFollowUpAt ?? null,
    });
    if (nextFollowUpAt != null) await this.update(publicId, { nextFollowUpAt });
  }

  async logActivity(
    publicId: string,
    input: { type: ActivityType; outcome?: string; note?: string; nextFollowUpAt?: number; amount?: number },
  ) {
    assertFiniteFollowUp(input.nextFollowUpAt);
    const inq = await this.read(publicId);
    await inquiryActivitiesService.create({
      inquiryId: inq.id,
      type: input.type,
      note: input.note ?? null,
      outcome: input.outcome ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      // Minor units; currency is the app's (app.currency), resolved at display time.
      amount: input.amount ?? null,
    });
    if (input.nextFollowUpAt != null) {
      await this.update(publicId, { nextFollowUpAt: input.nextFollowUpAt });
    }
  }

  async setStatus(
    publicId: string,
    input: { subStatus: SubStatus | null; note?: string; nextFollowUpAt?: number | null; lostReason?: LostReason },
  ): Promise<{ previous: SubStatus | null }> {
    const current = await this.read(publicId);
    if (current.stage === "converted") throw new ValidationError("A converted inquiry cannot change status");
    const previous = current.subStatus as SubStatus | null;
    const to = input.subStatus;
    assertTransition(previous, to);
    assertFiniteFollowUp(input.nextFollowUpAt);
    if (to === null && previous !== null && isClosed(previous)) {
      const other = await this.findOpenMatch(current.phone, current.email, current.id);
      if (other) {
        throw new ValidationError(`Another open lead has this phone or email (${other.publicId}). Open that lead instead.`);
      }
    }
    const note = input.note?.trim() || null;
    if (previous === to && !note && input.nextFollowUpAt === undefined) return { previous };

    let lostReason: LostReason | null = null;
    if (to === "undeliverable") lostReason = "out_of_zone";
    else if (to === "lost") {
      if (!input.lostReason) throw new ValidationError("A reason is required to mark an inquiry lost");
      lostReason = input.lostReason;
    }
    const nextFollowUpAt = isClosed(to) ? null : input.nextFollowUpAt === undefined ? current.nextFollowUpAt : input.nextFollowUpAt;
    const stage = stageFor(to);

    await this.update(publicId, { subStatus: to, stage, lostReason, nextFollowUpAt });
    await inquiryActivitiesService.create({
      inquiryId: current.id,
      type: "stage_change",
      fromStage: current.stage,
      toStage: stage,
      fromSubStatus: previous,
      toSubStatus: to,
      note,
      nextFollowUpAt,
    });
    return { previous };
  }

  async markLost(publicId: string, reason: LostReason, note?: string) {
    await this.setStatus(publicId, { subStatus: "lost", lostReason: reason, note });
  }

  // ponytail: legacy stage wrapper for callers not yet moved to setStatus; delete with them.
  async changeStage(publicId: string, toStage: Stage): Promise<{ previous: Stage }> {
    const current = await this.read(publicId);
    const previous = current.stage as Stage;
    if (toStage === previous) return { previous };
    if (toStage === "converted") throw new ValidationError("Convert the inquiry to record a plan or trial");
    if (toStage === "lost") {
      await this.setStatus(publicId, { subStatus: "lost", lostReason: "other" });
      return { previous };
    }
    const sub = ({ new: null, contacted: "responded", quoted: "expected", follow_up: "persistent" } as const)[toStage];
    await this.setStatus(publicId, { subStatus: sub });
    return { previous };
  }

  async convert(
    publicId: string,
    orderInput: CreateOrderInput,
    opts?: { allowAdditionalOrder?: boolean; allowCustomMeal?: boolean; basePriceOverride?: number },
  ) {
    const inq = await this.read(publicId);
    if (inq.stage === "converted") throw new ValidationError("Inquiry is already converted");

    const contactPhone = orderInput.contact.phone?.trim();
    const contactEmail = orderInput.contact.email?.trim();
    if (!orderInput.contact.fullName?.trim()) throw new ValidationError("Name is required");
    if (!contactPhone) throw new ValidationError("Phone is required");
    if (!contactEmail) throw new ValidationError("Email is required");

    // Contact is the person's identity from here on: it must not belong to a different open lead.
    const other = await this.findOpenMatch(contactPhone, contactEmail, inq.id);
    if (other) {
      throw new ValidationError(`This phone or email belongs to another open lead (${other.publicId}). Open that lead instead.`);
    }

    // Converting a lead when the phone already has a live subscription usually
    // means the order was placed another way — reject so staff open that order
    // instead of minting a duplicate. New Order / New Customer pass
    // allowAdditionalOrder for intentional second subscriptions.
    if (!opts?.allowAdditionalOrder) {
      await assertNoLiveOrderForPhone(contactPhone);
    }

    // Staff can only convert a lead into an order we can deliver; an out-of-zone lead stays
    // an inquiry (the same line public checkout draws).
    await assertServiceable({
      postalCode: parseCanadianPostalCode(orderInput.contact.postalCode),
      address: [orderInput.contact.addressLine, orderInput.contact.city, orderInput.contact.postalCode].filter(Boolean).join(", "),
    });

    assertOnePerson(orderInput);
    const actorPublicId = (await getSession())?.user?.id ?? null;
    const result = await createOrder(
      { ...orderInput, currentOwner: inq.currentOwner },
      // convert is the staff order path, and staff may start a plan today.
      { actorId: actorPublicId, allowCustomMeal: opts?.allowCustomMeal, staffCreated: true, basePriceOverride: opts?.basePriceOverride },
    );
    const [order] = await db
      .select({ id: orders.id, trialLength: orders.trialLength })
      .from(orders)
      .where(eq(orders.deploymentId, result.deploymentId))
      .limit(1);
    const subStatus = order.trialLength != null ? "took_trial" : "took_plan";
    await this.update(publicId, {
      phone: contactPhone,
      email: contactEmail,
      fullName: inq.fullName ?? (orderInput.contact.fullName?.trim() || null),
      stage: "converted",
      subStatus,
      nextFollowUpAt: null,
      convertedOrderId: order.id,
    });
    await inquiryActivitiesService.create({
      inquiryId: inq.id,
      type: "converted",
      fromStage: inq.stage,
      toStage: "converted",
      fromSubStatus: inq.subStatus,
      toSubStatus: subStatus,
    });
    return result;
  }

  async reassign(publicId: string, ownerId: string): Promise<void> {
    await assertReassignAllowed();
    const owner = await resolveAssignableOwner(ownerId);
    await this.update(publicId, { currentOwner: owner.id });
    // ponytail: inquiry_activity_type enum has no "reassigned" value and this is a
    // shared-schema file other agents are touching in parallel — skip the timeline
    // entry rather than widen the enum here.
  }

  /** Bulk reassign from the list selection. Per-row update keeps audit stamping from the session. */
  async reassignMany(publicIds: string[], ownerId: string): Promise<number> {
    await assertReassignAllowed();
    const ids = [...new Set(publicIds)];
    if (ids.length === 0) return 0;
    if (ids.length > 200) throw new ValidationError("Reassign at most 200 inquiries at a time");
    const owner = await resolveAssignableOwner(ownerId);
    for (const id of ids) await this.update(id, { currentOwner: owner.id });
    return ids.length;
  }

  // The pipeline list: server-side unified filters (Condition) + offset
  // pagination + unpaginated total. Named `listForPipeline` (not `list`) on
  // purpose — the framework reserves `BaseService.list` for the generic
  // raw-row paged API that @foundry/routes exposes, and a projected/joined shape
  // can't override it. Tasks 7/8 copy this method, not the base `list`.
  // No explicit return annotation: PipelineRow is inferred from it (below), so
  // annotating `Promise<Page<PipelineRow>>` would be a circular type reference.
  async listForPipeline(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<PipelineSortColumn> = { column: "created", dir: "desc" },
    queue?: { tab: QueueTab; dayStart: number; dayEnd: number },
    /** KPI bucket. When set, the follow-up queue is not applied — the card counted every matching inquiry. */
    bucket?: SQL,
  ) {
    const where = and(
      conditionToSql(condition, inquiriesResolver()),
      queue ? queuePredicate(queue.tab, queue.dayStart, queue.dayEnd) : undefined,
      bucket,
    );

    const agg = db
      .select({
        inquiryId: inquiryActivities.inquiryId,
        lastTouchAt: sql<number>`max(${inquiryActivities.createdAt})`.as("last_touch_at"),
      })
      .from(inquiryActivities)
      .groupBy(inquiryActivities.inquiryId)
      .as("agg");

    // Same sortable set as listForPipeline; nextAction/source-key facets are not
    // sort keys. Unknown columns fall back to createdAt.
    const SORT_COL = {
      name: inquiries.fullName,
      stage: inquiries.stage,
      source: leadSources.label,
      created: inquiries.createdAt,
      owner: users.name,
      lastTouch: agg.lastTouchAt,
      nextFollowUp: sql`coalesce(${inquiries.nextFollowUpAt}, -1)`,
    } as const;
    const col = SORT_COL[sort.column as keyof typeof SORT_COL] ?? inquiries.createdAt;

    // Count on the base table with the identical predicate — all facets are base
    // columns (owner/source/subsource resolve via subquery), so no join is needed.
    const [rows, [{ count }]] = await Promise.all([
      db
        .select({
          publicId: inquiries.publicId,
          fullName: inquiries.fullName,
          phone: inquiries.phone,
          source: leadSources.label,
          stage: inquiries.stage,
          subStatus: inquiries.subStatus,
          ownerId: users.publicId,
          ownerName: users.name,
          createdAt: inquiries.createdAt,
          lastTouchAt: agg.lastTouchAt,
          nextFollowUpAt: inquiries.nextFollowUpAt,
          lastNote: sql<string | null>`(
            select a.note from inquiry_activities a
            where a.inquiry_id = ${inquiries.id} and a.note is not null
            order by a.created_at desc limit 1
          )`,
        })
        .from(inquiries)
        .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
        .leftJoin(users, eq(inquiries.currentOwner, users.id))
        .leftJoin(agg, eq(agg.inquiryId, inquiries.id))
        .where(where)
        .orderBy(...pageOrder(sort.dir, col, inquiries.id))
        .limit(page.size)
        .offset(pageOffset(page.page, page.size)),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(inquiries)
        .where(where),
    ]);

    const now = Date.now();
    const items = rows.map((r) => ({ ...r, overdue: computeOverdue(r.stage, r.nextFollowUpAt, now) }));
    return { items, page: page.page, size: page.size, total: count };
  }

  async queueCounts(condition: Condition | undefined, dayStart: number, dayEnd: number): Promise<Record<QueueTab, number>> {
    const where = conditionToSql(condition, inquiriesResolver());
    const tabs: QueueTab[] = ["due", "overdue", "upcoming", "open", "closed", "quick"];
    const [row] = await db
      .select(Object.fromEntries(tabs.map((t) => [t, sql<number>`cast(count(*) filter (where ${queuePredicate(t, dayStart, dayEnd)}) as int)`])) as Record<QueueTab, SQL<number>>)
      .from(inquiries)
      .where(where);
    return row;
  }

  /** Oldest unhandled quick add the viewer's list would show (same `condition`), other than `excludeId`. */
  async nextQuickAdd(condition: Condition | undefined, excludeId?: bigint): Promise<{ publicId: string } | null> {
    const [row] = await db
      .select({ publicId: inquiries.publicId })
      .from(inquiries)
      .where(and(conditionToSql(condition, inquiriesResolver()), quickAddSql, excludeId != null ? ne(inquiries.id, excludeId) : undefined))
      .orderBy(asc(inquiries.createdAt), asc(inquiries.id))
      .limit(1);
    return row ?? null;
  }

  /** `condition` is a list filter (owner, source, …) resolved like the list's, so cards match the rows. */
  async groupCounts(where: SQL | undefined, condition?: Condition): Promise<{ lead: number; followUp: number; took: number; lost: number }> {
    const cnt = (p: SQL) => sql<number>`cast(count(*) filter (where ${p}) as int)`;
    const [row] = await db
      .select({
        lead: cnt(inquiryBucketWhere("lead")),
        followUp: cnt(inquiryBucketWhere("follow_up")),
        took: cnt(inquiryBucketWhere("took")),
        lost: cnt(inquiryBucketWhere("lost")),
      })
      .from(inquiries)
      .where(and(where, conditionToSql(condition, inquiriesResolver())));
    return row;
  }

  /**
   * Inquiries still in stage `new` (nobody has contacted them), oldest first, across all dates.
   * `visible` scopes by inquiries.organizationId: a row with no organization counts only for "all".
   */
  async listNew(visible: "all" | string[], limit: number) {
    if (visible !== "all" && visible.length === 0) return [];
    return db
      .select({ publicId: inquiries.publicId, fullName: inquiries.fullName, phone: inquiries.phone, source: sql<string>`coalesce(${leadSources.label}, 'No source')`, createdAt: inquiries.createdAt })
      .from(inquiries)
      // Left join: an inquiry with no source still counts in countNew, so it must list too.
      .leftJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
      .where(newWhere(visible))
      .orderBy(asc(inquiries.createdAt), asc(inquiries.id))
      .limit(limit);
  }

  async countNew(visible: "all" | string[]): Promise<number> {
    if (visible !== "all" && visible.length === 0) return 0;
    const [{ count }] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(inquiries).where(newWhere(visible));
    return count;
  }

  async listActivities(publicId: string) {
    const inq = await this.read(publicId);
    return db
      .select({
        ...getTableColumns(inquiryActivities),
        actorName: users.name,
        actorEmail: users.email,
        actorRole: users.role,
      })
      .from(inquiryActivities)
      .leftJoin(users, eq(users.id, inquiryActivities.createdBy))
      .where(eq(inquiryActivities.inquiryId, inq.id))
      .orderBy(desc(inquiryActivities.createdAt));
  }

  async findOpenByPhone(phone: string): Promise<
    { publicId: string; sourceKey: string; sourceLabel: string; stage: Stage; createdAt: number }[]
  > {
    const rows = await db
      .select({
        publicId: inquiries.publicId,
        sourceKey: leadSources.key,
        sourceLabel: leadSources.label,
        stage: inquiries.stage,
        createdAt: inquiries.createdAt,
      })
      .from(inquiries)
      .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
      .where(
        and(
          eq(sql`lower(${inquiries.phone})`, phone.toLowerCase()),
          notInArray(inquiries.stage, ["converted", "lost"]),
        ),
      )
      .orderBy(desc(inquiries.createdAt));
    return rows as {
      publicId: string;
      sourceKey: string;
      sourceLabel: string;
      stage: Stage;
      createdAt: number;
    }[];
  }

  async resolveForSource(input: {
    phone?: string;
    sourceKey: string;
    contact: { fullName?: string; email?: string };
    interest?: {
      planInterest?: string;
      mealSizeInterest?: string;
      personsInterest?: number;
  frequencyKeyInterest?: string;
  eatingDaysInterest?: string[];
      postalCode?: string;
      preferredStart?: string;
      quotedPrice?: number;
      subSourceKey?: string;
      notes?: string;
    };
    pickedId?: string;
  }): Promise<string> {
    if (input.pickedId) {
      const picked = await this.read(input.pickedId);
      if (picked.stage === "converted") throw new ValidationError("That inquiry is already converted");
      return picked.publicId;
    }
    // create() folds into the person's open inquiry (phone or email match).
    const inq = await this.create({
      fullName: input.contact.fullName,
      phone: input.phone,
      ...(input.contact.email ? { email: input.contact.email } : {}),
      sourceKey: input.sourceKey,
      ...(input.interest ?? {}),
    });
    return inq.publicId;
  }
}

const repo = new UpdatableRepository(db, inquiries, inquiries.publicId, inquiries.id);
export const inquiriesService = new InquiriesService(repo);

const inquiryActivitiesService = new SessionBaseService(
  new BaseRepository(db, inquiryActivities, inquiryActivities.publicId, inquiryActivities.id),
);
export type PipelineRow = Awaited<ReturnType<InquiriesService["listForPipeline"]>>["items"][number];
export type { Stage as InquiryStage, ActivityType, LostReason };
