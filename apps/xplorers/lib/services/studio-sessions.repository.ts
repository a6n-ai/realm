import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { studioSessions } from "@/db/schema";

export type StudioSessionRow = typeof studioSessions.$inferSelect;

export class StudioSessionsRepository extends UpdatableRepository<typeof studioSessions> {}

export const studioSessionsRepository = new StudioSessionsRepository(
  db,
  studioSessions,
  studioSessions.publicId,
  studioSessions.id,
);
