import { deleteContactList } from "@relay/engine";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";

export const DELETE = adminIdRoute((_req, id) => deleteContactList(campaignDeps, id));
