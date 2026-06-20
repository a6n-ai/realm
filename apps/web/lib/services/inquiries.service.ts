import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { ValidationError } from "@tiffin/commons";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, orders } from "@/db/schema";
import { auth } from "@/lib/auth";
import { SessionUpdatableService } from "./session-service";
import { createOrder, type CreateOrderInput } from "./orders.service";

type Stage = (typeof inquiries.stage.enumValues)[number];

class InquiriesService extends SessionUpdatableService<typeof inquiries> {
  async create(values: Record<string, unknown>) {
    const inq = await super.create(values);
    await db.insert(inquiryActivities).values({
      inquiryId: inq.id,
      type: "created",
      toStage: inq.stage,
      createdBy: await this.currentUserId(),
    });
    return inq;
  }

  async addNote(publicId: string, note: string) {
    const inq = await this.read(publicId);
    await db.insert(inquiryActivities).values({
      inquiryId: inq.id,
      type: "note",
      note,
      createdBy: await this.currentUserId(),
    });
  }

  async changeStage(publicId: string, toStage: Stage) {
    const current = await this.read(publicId);
    if (current.stage === toStage) return current;
    const updated = await this.update(publicId, { stage: toStage });
    await db.insert(inquiryActivities).values({
      inquiryId: current.id,
      type: "stage_change",
      fromStage: current.stage,
      toStage,
      createdBy: await this.currentUserId(),
    });
    return updated;
  }

  async convert(publicId: string, orderInput: CreateOrderInput) {
    const inq = await this.read(publicId);
    if (inq.stage === "converted") throw new ValidationError("Inquiry is already converted");
    const actorPublicId = (await auth())?.user?.id ?? null;
    const result = await createOrder(orderInput, { actorId: actorPublicId });
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.deploymentId, result.deploymentId))
      .limit(1);
    await this.update(publicId, { stage: "converted", convertedOrderId: order.id });
    await db.insert(inquiryActivities).values({
      inquiryId: inq.id,
      type: "converted",
      fromStage: inq.stage,
      toStage: "converted",
      createdBy: await this.currentUserId(),
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
export type { Stage as InquiryStage };
