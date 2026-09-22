import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";
import { sendStaffInvitation } from "../security-events";

const MARK = "staff-invite-int";
const EMAIL = `${MARK}@example.test`;

afterEach(async () => {
  await db.delete(notificationOutbox).where(eq(notificationOutbox.recipientEmail, EMAIL));
});

describe("sendStaffInvitation", () => {
  it("enqueues a staff_invitation outbox row on the email channel with the invite url", async () => {
    const inviteUrl = "https://app.tiffingrab.ca/accept-invitation/inv_123";
    await sendStaffInvitation({ email: EMAIL, role: "admin", inviteUrl });

    const rows = await db
      .select({
        event: notificationOutbox.event,
        channel: notificationOutbox.channel,
        kind: notificationOutbox.kind,
        payload: notificationOutbox.payload,
        dedupeKey: notificationOutbox.dedupeKey,
      })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientEmail, EMAIL));

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.event).toBe("staff_invitation");
    expect(row.channel).toBe("email");
    expect(row.kind).toBe("transactional");
    expect(row.payload).toMatchObject({ vars: { role: "admin", inviteUrl } });
    expect(row.dedupeKey).toBe(`staff_invitation:${EMAIL.toLowerCase()}:email`);
  });
});
