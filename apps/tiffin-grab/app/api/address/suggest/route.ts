import { readJson } from "@/lib/http/read-json";
import { z } from "zod";
import { clientIp, isRateLimited } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { awsPlaceProvider } from "@foundry/places";
import { awsRegion } from "@/lib/runtime/env";

const suggestSchema = z.object({ query: z.string().trim().min(1) });

// Fires on every keystroke of a debounced typeahead — tighter budget lives on
// /api/address/resolve (fires once per pick), same split as puchkaman.
const SUGGEST_LIMIT = 60;
const SUGGEST_WINDOW_MS = 60_000;

// Public (unauthenticated), cheapest Places bucket. Never an error status —
// a throttled or empty result both degrade to an empty dropdown, not a toast.
export const POST = handler(async (request: Request): Promise<Response> => {
  const ip = clientIp(request) ?? "unknown";
  if (isRateLimited(ip, SUGGEST_LIMIT, SUGGEST_WINDOW_MS, "address-suggest-ip")) {
    return json({ suggestions: [] });
  }

  const parsed = await readJson(request, suggestSchema);
  if (!parsed.success) return json({ suggestions: [] });

  const suggestions = await awsPlaceProvider({ region: awsRegion() }).suggest(
    parsed.data.query,
    { country: "CA" },
  );
  return json({ suggestions });
});
