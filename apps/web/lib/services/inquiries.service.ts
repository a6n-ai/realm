import { BaseRepository, UpdatableRepository } from "@tiffin/commons-drizzle";
import { ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadSources, leadSubsources, orders, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { SessionBaseService, SessionUpdatableService } from "./session-service";
import { createOrder, type CreateOrderInput } from "./orders.service";

type Stage = (typeof inquiries.stage.enumValues)[number];
type ActivityType = "call" | "whatsapp" | "email" | "note";
type LostReason = (typeof inquiries.lostReason.enumValues)[number];

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

  private async resolveOwner(isInbound: boolean): Promise<bigint | null> {
    if (!isInbound) return this.currentUserId();
    const [sys] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
    return sys?.id ?? null;
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
    const { sourceId, subSourceId, isInbound } = await this.resolveSource(sourceKey, subSourceKey);
    const currentOwner = await this.resolveOwner(isInbound);
    const zoneId = await this.resolveZoneId(rest.postalCode as string | undefined);

    const inq = await super.create({
      ...rest,
      phone: parsedPhone.data,
      ...(parsedEmail ? { email: parsedEmail.data } : {}),
      sourceId,
      subSourceId,
      currentOwner,
      zoneId,
    });
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

  async changeStage(publicId: string, toStage: Stage) {
    const current = await this.read(publicId);
    if (current.stage === toStage) return current;
    const updated = await this.update(publicId, { stage: toStage });
    await inquiryActivitiesService.create({
      inquiryId: current.id,
      type: "stage_change",
      fromStage: current.stage,
      toStage,
    });
    return updated;
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

  async listActivities(publicId: string) {
    const inq = await this.read(publicId);
    return db
      .select()
      .from(inquiryActivities)
      .where(eq(inquiryActivities.inquiryId, inq.id))
      .orderBy(desc(inquiryActivities.createdAt));
  }
}

const repo = new UpdatableRepository(db, inquiries, inquiries.publicId, inquiries.id);
export const inquiriesService = new InquiriesService(repo);

const inquiryActivitiesService = new SessionBaseService(
  new BaseRepository(db, inquiryActivities, inquiryActivities.publicId, inquiryActivities.id),
);
export type { Stage as InquiryStage, ActivityType, LostReason };
