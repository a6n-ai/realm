import {
  buildCampaignConfig,
  buildHandlers,
  type ChannelProvider,
} from "@relay/engine";
import { getEmailProvider } from "@/lib/email/provider";
import { db } from "@/db/client";
import { getBrandOrganizationAddress } from "@/lib/services/organizations.service";
import { notificationTables, usersRef } from "./tables";
import { broadcast } from "./broadcast";

/** Adapt @relay/email's EmailProvider to the package's ChannelProvider shape. */
function emailChannelProvider(): ChannelProvider {
  const provider = getEmailProvider();
  return {
    send: (msg) =>
      provider.send({
        to: { email: msg.to.email! },
        subject: msg.subject!,
        html: msg.html,
        text: msg.text,
        attachments: msg.attachments,
      }),
  };
}

export async function buildAppHandlers() {
  // The CASL-required postal address is admin-editable (Organization > brand
  // client's address field) rather than an env var — env vars need a redeploy
  // to change; an admin fixing a wrong mailing address should not.
  const postalAddress = await getBrandOrganizationAddress();
  const env = postalAddress ? { ...process.env, CAMPAIGN_POSTAL_ADDRESS: postalAddress } : process.env;
  return buildHandlers({
    db,
    tables: notificationTables,
    users: usersRef,
    providers: { email: emailChannelProvider() },
    broadcast,
    campaigns: buildCampaignConfig(notificationTables, env, { senderName: "TiffinGrab" }),
  });
}
