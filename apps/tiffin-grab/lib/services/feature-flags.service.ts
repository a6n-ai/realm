import { UpdatableRepository } from "@realm/commons-drizzle";
import { db } from "@/db/client";
import { featureFlags } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

const repo = new UpdatableRepository(db, featureFlags, featureFlags.publicId, featureFlags.id);
export const featureFlagsService = new SessionUpdatableService(repo);
