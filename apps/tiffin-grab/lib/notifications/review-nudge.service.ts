import { drizzleReviewNudgeStore } from "@foundry/google-reviews/db";
import { db } from "@/db/client";

export const reviewNudgeStore = drizzleReviewNudgeStore(db);
