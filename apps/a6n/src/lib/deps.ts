import { roomControl, type RoomControl } from "@foundry/collab/server";
import { getDb, type CrmDb } from "../db/client";
import type { Env } from "../env";
import type { ArchivedDoc } from "./docs/archive";
import { mailerFor, type Mailer } from "./mail/mailer";

export type Rooms = RoomControl & { closeAll(docId: string): Promise<void> };
export type Archive = { put(doc: ArchivedDoc): Promise<void> };
export type Deps = { db: CrmDb; mailer: () => Mailer; authUrl: string; rooms: Rooms; archive: Archive };

// The mailer is a function so only the actions that send mail resolve it (and can fail with MailUnavailableError).
export const depsFor = (env: Env): Deps => ({
  db: getDb(env),
  mailer: () => mailerFor(env),
  authUrl: env.BETTER_AUTH_URL,
  archive: {
    put: async (doc) => {
      await env.DOC_ARCHIVE.getByName(doc.organizationId).put(doc);
    },
  },
  rooms: {
    ...roomControl(env.COLLAB_ROOM),
    closeAll: async (docId) => {
      await env.COLLAB_ROOM.getByName(docId).closeAll();
    },
  },
});
