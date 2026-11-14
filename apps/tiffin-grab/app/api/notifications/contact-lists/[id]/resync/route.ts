import { resyncContactList } from "@relay/engine";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";

export const POST = adminIdRoute((_req, id) => resyncContactList(campaignDeps, id));
