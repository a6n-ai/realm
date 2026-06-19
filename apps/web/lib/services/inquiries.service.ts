import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

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

  async addNote(inquiryId: string, note: string) {
    await this.read(inquiryId);
    await db.insert(inquiryActivities).values({
      inquiryId,
      type: "note",
      note,
      createdBy: await this.currentUserId(),
    });
  }

  async changeStage(inquiryId: string, toStage: Stage) {
    const current = await this.read(inquiryId);
    if (current.stage === toStage) return current;
    const updated = await this.update(inquiryId, { stage: toStage });
    await db.insert(inquiryActivities).values({
      inquiryId,
      type: "stage_change",
      fromStage: current.stage,
      toStage,
      createdBy: await this.currentUserId(),
    });
    return updated;
  }

  async listActivities(inquiryId: string) {
    return db
      .select()
      .from(inquiryActivities)
      .where(eq(inquiryActivities.inquiryId, inquiryId))
      .orderBy(desc(inquiryActivities.createdAt));
  }
}

const repo = new UpdatableRepository(db, inquiries, inquiries.id);
export const inquiriesService = new InquiriesService(repo);
export type { Stage as InquiryStage };
