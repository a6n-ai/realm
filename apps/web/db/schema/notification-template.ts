import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { appEvent } from "./wallet";
import { notificationChannel } from "./notifications";
import { locale } from "./auth";

/**
 * Admin-authored notification templates. The live source the drainer renders
 * from: keyed by (event, channel, locale) with an `en` fallback. `subject` is
 * the email subject / in-app title; `body` is Markdown with {{entity.field}}
 * variables. No row → generic branded fallback (see render-email).
 */
export const notificationTemplate = pgTable("notification_template", {
  ...updatableColumns("ntp"),
  event: appEvent("event").notNull(),
  channel: notificationChannel("channel").notNull(),
  locale: locale("locale").notNull(),
  subject: text("subject").notNull(),
  // in_app: markdown. email: the editor HTML (reload source for re-editing).
  body: text("body"),
  // email only: exported email-safe HTML + plaintext (pre-interpolation).
  html: text("html"),
  text: text("text"),
  enabled: boolean("enabled").notNull().default(true),
}, (t) => [
  uniqueIndex("notification_template_key_idx").on(t.event, t.channel, t.locale),
]);
