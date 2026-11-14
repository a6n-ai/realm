import { sql } from "drizzle-orm";
import { notificationOutbox } from "@/db/schema";

export const CUSTOMER_INVITATION_EVENT = "customer_invitation" as const;

/** True when this address has an invite email queued or sent (a failed send counts as not sent). */
export const inviteAlreadySent = (email: unknown) =>
  sql`exists (select 1 from ${notificationOutbox} o where o.event = ${CUSTOMER_INVITATION_EVENT} and o.channel = 'email'
    and o.recipient_email = ${email} and o.status <> 'failed')`;

/** Latest invite row's send state for an address; `stateJson` is the caller's SendState projection. */
export const lastInviteState = (email: unknown, stateJson: unknown) =>
  sql`(select ${stateJson} from ${notificationOutbox} o
    where o.event = ${CUSTOMER_INVITATION_EVENT} and o.channel = 'email' and o.recipient_email = ${email}
    order by o.created_at desc limit 1)`;
