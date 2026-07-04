import { BaseRepository, UpdatableRepository } from "@realm/commons-drizzle";
import { ValidationError, phoneSchema, emailSchema } from "@realm/commons";
import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadSources, leadSubsources, orders, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { SessionBaseService, SessionUpdatableService } from "./session-service";
import { createOrder, type CreateOrderInput } from "./orders.service";
import { getLeadAssignment, setLeadAssignment } from "./app-settings.service";
import { pickAssignee, strategyFor } from "./assignment";
import { poolForSource } from "./inquiry-user-config.service";
import type { SortState } from "@/lib/list/sort";

export type PipelineSortColumn =
  | "name"
  | "owner"
  | "stage"
  | "source"
  | "lastTouch"
  | "nextAction"
  | "created";

type Stage = (typeof inquiries.stage.enumValues)[number];
type ActivityType = "call" | "whatsapp" | "email" | "note";
type LostReason = (typeof inquiries.lostReason.enumValues)[number];

export function computeOverdue(stage: string, nextFollowUpAt: number | null, now: number): boolean {
  if (nextFollowUpAt == null) return false;
  if (stage === "converted" || stage === "lost") return false;
  return nextFollowUpAt < now;
}

// True when a Postgres unique-violation (23505) hit the open-lead partial index.
// drizzle wraps the driver error, so the real PostgresError (with code +
// constraint_name) sits on .cause; postgres.js names the field constraint_name.
function isOpenLeadConflict(e: unknown): boolean {
  type PgErr = { code?: string; constraint?: string; constraint_name?: string; cause?: PgErr };
  const err = e as PgErr;
  const layers = [err, err?.cause, err?.cause?.cause].filter(Boolean) as PgErr[];
  return layers.some(
    (l) =>
      l.code === "23505" &&
      (l.constraint ?? l.constraint_name ?? "").includes("inquiries_open_phone_source_uq"),
  );
}

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

  private async resolveOwner(sourceId: bigint, sourceKey: string, isInbound: boolean): Promise<bigint> {
    if (!isInbound) {
      const actor = await this.currentUserId();
      return actor ?? (await this.systemUserId());
    }
    const cfg = await getLeadAssignment();
    const strat = strategyFor(cfg, sourceKey);
    if (strat === "creator") {
      const actor = await this.currentUserId();
      return actor ?? (await this.systemUserId());
    }
    const sourcePool = await poolForSource(sourceId);
    const pool = sourcePool.length ? sourcePool : await poolForSource(null);
    if (!pool.length) return this.systemUserId();

    const roll = await this.rollFor();
    const { chosen, cursorPublicId } = pickAssignee(strat, pool, cfg, sourceKey, roll);
    if (!chosen) return this.systemUserId();
    if (strat === "round_robin" && cursorPublicId) {
      await setLeadAssignment({ ...cfg, cursor: { ...cfg.cursor, [sourceKey]: cursorPublicId } });
    }
    return chosen.id;
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
    const z = matchZone(postalCode, zones);
    if (!z) return null;
    return zones.find((x) => x.name === z.name)?.id ?? null;
  }

  async create(values: Record<string, unknown>) {
    const parsedPhone = phoneSchema().safeParse(values.phone);
    if (!parsedPhone.success) throw new ValidationError("Enter a valid phone number");
    const parsedEmail = values.email ? emailSchema.safeParse(values.email) : null;
    if (parsedEmail && !parsedEmail.success) throw new ValidationError("Enter a valid email");

    const { sourceKey, subSourceKey, ...rest } = values as {
      sourceKey: string;
      subSourceKey?: string;
      [k: string]: unknown;
    };
    // Zone resolution depends only on the postal code, so run it alongside the
    // source→owner chain instead of after it.
    const zoneIdP = this.resolveZoneId(rest.postalCode as string | undefined);
    const { sourceId, subSourceId, isInbound } = await this.resolveSource(sourceKey, subSourceKey);
    const currentOwner = await this.resolveOwner(sourceId, sourceKey, isInbound);
    const zoneId = await zoneIdP;

    let inq: typeof inquiries.$inferSelect;
    try {
      inq = await super.create({
        ...rest,
        phone: parsedPhone.data,
        ...(parsedEmail ? { email: parsedEmail.data } : {}),
        sourceId,
        subSourceId,
        currentOwner,
        zoneId,
      });
    } catch (e) {
      // Partial unique index inquiries_open_phone_source_uq: one open lead per
      // (phone, source). A concurrent insert lost the race — reuse the existing
      // open inquiry rather than erroring (the dedup rule, enforced at the DB).
      if (isOpenLeadConflict(e)) {
        const [existing] = await db
          .select()
          .from(inquiries)
          .where(
            and(
              eq(sql`lower(${inquiries.phone})`, parsedPhone.data.toLowerCase()),
              eq(inquiries.sourceId, sourceId),
              notInArray(inquiries.stage, ["converted", "lost"]),
            ),
          )
          .limit(1);
        if (existing) return existing;
      }
      throw e;
    }
    await inquiryActivitiesService.create({
      inquiryId: inq.id,
      type: "created",
      toStage: inq.stage,
    });
    return inq;
  }

  async addNote(publicId: string, note: string) {
    const inq = await this.read(publicId);
    await inquiryActivitiesService.create({
      inquiryId: inq.id,
      type: "note",
      note,
    });
  }

  async logActivity(
    publicId: string,
    input: { type: ActivityType; outcome?: string; note?: string; nextFollowUpAt?: number },
  ) {
    const inq = await this.read(publicId);
    await inquiryActivitiesService.create({
      inquiryId: inq.id,
      type: input.type,
      note: input.note ?? null,
      outcome: input.outcome ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
    });
  }

  async markLost(publicId: string, reason: LostReason, note?: string) {
    const current = await this.read(publicId);
    if (current.stage === "converted") throw new ValidationError("Converted inquiry cannot be marked lost");
    await this.update(publicId, { stage: "lost", lostReason: reason });
    await inquiryActivitiesService.create({
      inquiryId: current.id,
      type: "stage_change",
      fromStage: current.stage,
      toStage: "lost",
      note: note ?? null,
    });
  }

  async changeStage(publicId: string, toStage: Stage): Promise<{ previous: Stage }> {
    const current = await this.read(publicId);
    const previous = current.stage as Stage;
    if (current.stage === toStage) return { previous };
    await this.update(publicId, { stage: toStage });
    await inquiryActivitiesService.create({
      inquiryId: current.id,
      type: "stage_change",
      fromStage: current.stage,
      toStage,
    });
    return { previous };
  }

  async convert(publicId: string, orderInput: CreateOrderInput) {
    const inq = await this.read(publicId);
    if (inq.stage === "converted") throw new ValidationError("Inquiry is already converted");
    const actorPublicId = (await getSession())?.user?.id ?? null;
    const result = await createOrder(
      { ...orderInput, currentOwner: inq.currentOwner },
      { actorId: actorPublicId },
    );
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.deploymentId, result.deploymentId))
      .limit(1);
    await this.update(publicId, { stage: "converted", convertedOrderId: order.id });
    await inquiryActivitiesService.create({
      inquiryId: inq.id,
      type: "converted",
      fromStage: inq.stage,
      toStage: "converted",
    });
    return result;
  }

  async listForPipeline(
    sort: SortState<PipelineSortColumn> = { column: "created", dir: "desc" },
  ) {
    const agg = db
      .select({
        inquiryId: inquiryActivities.inquiryId,
        lastTouchAt: sql<number>`max(${inquiryActivities.createdAt})`.as("last_touch_at"),
      })
      .from(inquiryActivities)
      .groupBy(inquiryActivities.inquiryId)
      .as("agg");

    const SORT_COL = {
      name: inquiries.fullName,
      stage: inquiries.stage,
      source: leadSources.label,
      created: inquiries.createdAt,
      owner: users.name,
      lastTouch: agg.lastTouchAt,
    } as const;
    // nextAction sorts by the correlated subquery alias; fall back to created when unsupported.
    const col = SORT_COL[sort.column as keyof typeof SORT_COL] ?? inquiries.createdAt;

    const rows = await db
      .select({
        publicId: inquiries.publicId,
        fullName: inquiries.fullName,
        phone: inquiries.phone,
        source: leadSources.label,
        stage: inquiries.stage,
        ownerName: users.name,
        createdAt: inquiries.createdAt,
        lastTouchAt: agg.lastTouchAt,
        // The LATEST activity's nextFollowUpAt (null when the most recent touch
        // scheduled none) — a newer touch with no follow-up clears overdue. This
        // matches the detail-page timeline (latest-row) overdue semantics.
        nextFollowUpAt: sql<number | null>`(
          select a.next_follow_up_at from inquiry_activities a
          where a.inquiry_id = ${inquiries.id}
          order by a.created_at desc limit 1
        )`,
      })
      .from(inquiries)
      .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
      .leftJoin(users, eq(inquiries.currentOwner, users.id))
      .leftJoin(agg, eq(agg.inquiryId, inquiries.id))
      .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
      .limit(500);

    const now = Date.now();
    return rows.map((r) => ({ ...r, overdue: computeOverdue(r.stage, r.nextFollowUpAt, now) }));
  }

  async listActivities(publicId: string) {
    const inq = await this.read(publicId);
    return db
      .select()
      .from(inquiryActivities)
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
    phone: string;
    sourceKey: string;
    contact: { fullName: string; email?: string };
    interest?: {
      planInterest?: string;
      mealSizeInterest?: string;
      personsInterest?: number;
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
    // Normalize once so the dedup lookup and the stored row use the identical
    // canonical (E.164) phone — an unnormalized lookup would miss the normalized
    // record and let a duplicate inquiry slip through.
    const parsedPhone = phoneSchema().safeParse(input.phone);
    const phone = parsedPhone.success ? parsedPhone.data : input.phone;
    const open = await this.findOpenByPhone(phone);
    const sameSource = open.find((o) => o.sourceKey === input.sourceKey);
    if (sameSource) return sameSource.publicId;

    const inq = await this.create({
      fullName: input.contact.fullName,
      phone,
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
export type PipelineRow = Awaited<ReturnType<InquiriesService["listForPipeline"]>>[number];
export type { Stage as InquiryStage, ActivityType, LostReason };
