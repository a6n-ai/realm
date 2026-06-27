import { mintRepCoupons } from "@/lib/services/mint-rep-coupons";

// Scheduler-agnostic protected route (see spec §8.1, locked decision 7). Not
// deployed yet — a real scheduler (Vercel Cron / system crontab `30 18 * * *`
// UTC = 00:00 IST) is wired when a host is chosen. The route is the contract.
//
// Reading the Authorization header makes this request-time only; never cache.
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  // Fail closed: no configured secret, or a mismatched bearer → 401.
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await mintRepCoupons();
  return Response.json(summary);
}

// Vercel Cron issues GET; system crontab can curl either verb with the bearer.
export const GET = handle;
export const POST = handle;
