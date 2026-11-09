import { afterEach, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";
import { dedupeKeyStartsWith } from "../dedupe-prefix";

const MARK = "zz-dedupe-prefix";
const clear = () => db.delete(notificationOutbox).where(like(notificationOutbox.dedupeKey, `${MARK}%`));
afterEach(clear);

it("matches `_` and `%` literally, so a public id never matches a neighbour", async () => {
  await clear();
  const keys = [`${MARK}:ord_ab:1:email`, `${MARK}:ordXab:1:email`, `${MARK}:ord%ab:1:email`];
  await db.insert(notificationOutbox).values(keys.map((dedupeKey) => ({ channel: "email" as const, payload: {}, dedupeKey })));
  const hits = (prefix: string) =>
    db.select({ k: notificationOutbox.dedupeKey }).from(notificationOutbox).where(dedupeKeyStartsWith(prefix)).then((r) => r.map((x) => x.k));
  expect(await hits(`${MARK}:ord_ab:`)).toEqual([keys[0]]);
  expect(await hits(`${MARK}:ord%ab:`)).toEqual([keys[2]]);
});
