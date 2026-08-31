import { makeCampaignTables, makeNotificationTables } from "@relay/engine/schema";
import { locale, users } from "./auth";
import { appEvent } from "./wallet";

export const campaignTables = makeCampaignTables({ locale });

export const { campaignStatus, consentSource, campaign, campaignContent, contactList, contactListMember } =
  campaignTables;

// `campaign` is passed so notification_outbox.campaign_id carries a real FK.
const baseNotificationTables = makeNotificationTables({
  users,
  appEvent,
  locale,
  campaign,
});

/**
 * Merged bag. The package's campaign functions take `NotificationTables &
 * CampaignTables`, and callers that only need the notification subset are
 * satisfied structurally — so one object serves both rather than every call
 * site spreading two.
 */
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
} = baseNotificationTables;
