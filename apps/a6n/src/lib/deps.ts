import { roomControl, type RoomControl } from "@foundry/collab/server";
import { getDb, type CrmDb } from "../db/client";
import type { Env } from "../env";
import { mailerFor, type Mailer } from "./mail/mailer";

export type Deps = { db: CrmDb; mailer: () => Mailer; authUrl: string; rooms: RoomControl };

// The mailer is a function so only the actions that send mail resolve it (and can fail with MailUnavailableError).
export const depsFor = (env: Env): Deps => ({
  db: getDb(env),
  mailer: () => mailerFor(env),
  authUrl: env.BETTER_AUTH_URL,
  rooms: roomControl(env.COLLAB_ROOM),
});
