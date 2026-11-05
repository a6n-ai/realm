import { handler, json } from "@foundry/routes";
import { applyUnsubscribe } from "@/lib/notifications/apply-unsubscribe";

export const GET = handler(async (req: Request): Promise<Response> => {
  await applyUnsubscribe(new URL(req.url), "link");
  return json({ ok: true });
});

// RFC 8058 one-click: mail clients POST the List-Unsubscribe-Post target.
export const POST = handler(async (req: Request): Promise<Response> => {
  await applyUnsubscribe(new URL(req.url), "one-click");
  return json({ ok: true });
});
