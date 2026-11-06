import { appEvent } from "@/db/schema";

/** Events that produce notifications; shared by the Email events page and its actions. */
export const NOTIFICATION_EVENTS: string[] = appEvent.enumValues.filter((e) => e !== "manual_adjustment");
