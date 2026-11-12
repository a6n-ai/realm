import { db } from "@/db/client";
import { resolveSegment } from "@/lib/campaigns/segment";
import { notificationTables, usersRef } from "@/lib/notifications/tables";

/** Everything the @relay/engine campaign and contact-list calls need from this app. */
export const campaignDeps = { db, tables: notificationTables, users: usersRef, resolveSegment };
