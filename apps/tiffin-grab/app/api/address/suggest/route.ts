import { z } from "zod";
import { clientIp, isRateLimited } from "@realm/commons";
import { handler, json } from "@realm/routes";
import { awsPlaceProvider } from "@realm/places";

const suggestSchema = z.object({ query: z.string().trim().min(1) });

// Fires on every keystroke of a debounced typeahead — tighter budget lives on
// /api/address/resolve (fires once per pick), same split as puchkaman.
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

  const suggestions = await awsPlaceProvider({ region: process.env.AWS_REGION }).suggest(
    parsed.data.query,
    { country: "CA" },
  );
  return json({ suggestions });
});
