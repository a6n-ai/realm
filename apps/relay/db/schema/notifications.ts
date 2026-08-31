import { makeTenantNotificationTables } from "@relay/engine/schema";
import { tenants } from "./tenants";

export const notificationTables = makeTenantNotificationTables({ tenants });
