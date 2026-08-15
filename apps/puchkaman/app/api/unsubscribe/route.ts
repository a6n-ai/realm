import { handleUnsubscribe } from "@realm/notifications";
import { handler, json } from "@realm/routes";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";

/**
 * One-click unsubscribe. The token IS the auth, so no session is needed — a
 * recipient who never had an account must be able to opt out.
 *
 * The response is identical whether or not the token verified and whether or
 * not the address exists, so the endpoint cannot be used to test membership.
 */
export async function applyUnsubscribe(url: URL): Promise<void> {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) return;
  await handleUnsubscribe(db, notificationTables, {
    address: url.searchParams.get("address"),
    token: url.searchParams.get("token"),
    secret,
  });
}

export const GET = handler(async (req: Request): Promise<Response> => {
  await applyUnsubscribe(new URL(req.url));
  return json({ ok: true });
});

// RFC 8058 one-click: some clients POST the List-Unsubscribe-Post target.
export const POST = GET;
