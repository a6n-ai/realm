import { BaseRepository, UpdatableRepository } from "@tiffin/commons-drizzle";
import { ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, orders } from "@/db/schema";
import { auth } from "@/lib/auth";
import { SessionBaseService, SessionUpdatableService } from "./session-service";
import { createOrder, type CreateOrderInput } from "./orders.service";

type Stage = (typeof inquiries.stage.enumValues)[number];

class InquiriesService extends SessionUpdatableService<typeof inquiries> {
  async create(values: Record<string, unknown>) {
    const parsedPhone = phoneSchema().safeParse(values.phone);
    if (!parsedPhone.success) throw new ValidationError("Enter a valid phone number");
    const parsedEmail = values.email ? emailSchema.safeParse(values.email) : null;
    if (parsedEmail && !parsedEmail.success) throw new ValidationError("Enter a valid email");
    const inq = await super.create({
      ...values,
      phone: parsedPhone.data,
      ...(parsedEmail ? { email: parsedEmail.data } : {}),
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
    const actorPublicId = (await auth())?.user?.id ?? null;
    const result = await createOrder(orderInput, { actorId: actorPublicId });
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
export type { Stage as InquiryStage };
