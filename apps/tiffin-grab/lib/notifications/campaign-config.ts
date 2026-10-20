import { buildCampaignConfig } from "@relay/engine";
import { getBrandOrganizationAddress } from "@/lib/services/organizations.service";
import { notificationTables } from "./tables";

/**
 * Campaign sender + footer config. The CASL-required postal address is
 * admin-editable (Organization > brand client's address field) rather than an
 * env var — env vars need a redeploy to change; an admin fixing a wrong mailing
 * address should not. Every caller goes through here so the preview, the
 * send/schedule checks and the actual send agree on whether a footer exists.
 */
export async function campaignConfig() {
  const postalAddress = await getBrandOrganizationAddress();
  const env = postalAddress ? { ...process.env, CAMPAIGN_POSTAL_ADDRESS: postalAddress } : process.env;
  return buildCampaignConfig(notificationTables, env, { senderName: "TiffinGrab" });
}
