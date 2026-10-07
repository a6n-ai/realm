import { makeCampaignTables, makeNotificationTables } from "@relay/engine/schema";
import { locale, users } from "./auth";
import { appEvent } from "./wallet";

export const campaignTables = makeCampaignTables({ locale });

export const { campaignStatus, consentSource, campaign, campaignContent, contactList, contactListMember } =
  campaignTables;

const baseNotificationTables = makeNotificationTables({
  users,
  appEvent,
  locale,
  campaign,
});

/** Merged bag — campaign + notification tables for drizzle and @relay/engine callers. */
export const notificationTables = { ...baseNotificationTables, ...campaignTables };

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
  phoneVerification,
} = baseNotificationTables;
