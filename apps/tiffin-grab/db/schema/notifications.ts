import { makeNotificationTables } from "@realm/notifications/schema";
import { locale, users } from "./auth";
import { appEvent } from "./wallet";

export const notificationTables = makeNotificationTables({ users, appEvent, locale });

export const {
  notificationChannel,
  outboxStatus,
  messageKind,
  suppressionScope,
  notifications,
  notificationOutbox,
  notificationPrefs,
  notificationTemplate,
  messageSuppression,
} = notificationTables;
