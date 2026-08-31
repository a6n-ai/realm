import { handler, json, problem } from "@foundry/routes";
import {
  loadCloverWebhookAuthFromEnv,
  parseCloverWebhookBody,
  verifyCloverWebhookAuth,
} from "@foundry/clover";
import { createLogger } from "@foundry/commons/logger";
import { ordersService } from "@/lib/services/orders.service";

const log = createLogger("clover-webhook");

/**
 * Clover Developer Dashboard app webhook receiver.
 *
 * Register: `https://<host>/api/integrations/clover/webhook`
 * (local: tunnel → that path). Subscribe to Payments + Orders.
 * Set `CLOVER_WEBHOOK_AUTH` to the Dashboard "Clover Auth Code" after URL verify.
 */
export const POST = handler(async (request: Request): Promise<Response> => {
  const body = await request.json().catch(() => null);
  const parsed = parseCloverWebhookBody(body);

  if (parsed.kind === "verification") {
    // Code is in the POST body Clover just sent — paste into Dashboard → Verify.
    // Do not log the full auth secret; verification codes are one-time setup values.
    log.info("Clover webhook verification received (paste verificationCode into Dashboard)");
    return json({ ok: true, verificationCode: parsed.verificationCode });
  }

  const expected = loadCloverWebhookAuthFromEnv();
  const authHeader = request.headers.get("x-clover-auth");
  if (!verifyCloverWebhookAuth(authHeader, expected)) {
    return problem(401, "Invalid Clover webhook auth");
  }

  if (parsed.kind !== "notification") {
    return json({ ok: true, skipped: true });
  }

  const result = await ordersService.handleCloverWebhookUpdates(parsed.updates);
  return json({ ok: true, ...result });
});
