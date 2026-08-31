import { z } from "zod";
import { clientIp, isRateLimited } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { suggestAddresses } from "@/lib/delivery/resolve-address";

const suggestSchema = z.object({ query: z.string().trim().min(1) });

// Fires on every keystroke of a debounced typeahead — tighter than
// check-address's 20/min (that's one call per submit, not per keypress).
const SUGGEST_LIMIT = 60;
const SUGGEST_WINDOW_MS = 60_000;

// Public (unauthenticated), cheapest Places bucket. Never an error status —
// a throttled or empty result both degrade to an empty dropdown, not a toast.
export const POST = handler(async (request: Request): Promise<Response> => {
  const ip = clientIp(request) ?? "unknown";
  if (isRateLimited(ip, SUGGEST_LIMIT, SUGGEST_WINDOW_MS)) {
    return json({ suggestions: [] });
  }

  const parsed = suggestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ suggestions: [] });

  const suggestions = await suggestAddresses(parsed.data.query);
  return json({ suggestions });
});
