import { withCronAuth } from "@/lib/cron/auth";
import { mintRepCoupons } from "@/lib/coupons/mint-rep-coupons";

// Not deployed yet: a real scheduler runs it just after 00:00 in the app-settings timezone
// (America/Toronto: `5 4 * * *` UTC in EDT, `5 5 * * *` in EST) when a host is chosen.
export const dynamic = "force-dynamic";

const handle = withCronAuth(async () => Response.json(await mintRepCoupons()));

export const GET = handle;
export const POST = handle;
