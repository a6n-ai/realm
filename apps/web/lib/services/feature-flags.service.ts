import { UpdatableRepository, UpdatableService } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { featureFlags } from "@/db/schema";

const repo = new UpdatableRepository(db, featureFlags, featureFlags.id);
export const featureFlagsService = new UpdatableService(repo);
