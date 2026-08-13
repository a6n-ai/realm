import { makeCampaignTables, makeNotificationTables } from "@realm/notifications/schema";
import { locale, users } from "./auth";
import { appEvent } from "./events";

export const campaignTables = makeCampaignTables({ locale });

export const { campaignStatus, consentSource, campaign, campaignContent, contactList, contactListMember } =
  campaignTables;

// `campaign` is passed so notification_outbox.campaign_id carries a real FK.
export const notificationTables = makeNotificationTables({
  users,
  appEvent,
  locale,
  campaign,
});

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
