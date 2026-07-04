import { mintRepCoupons } from "@/lib/services/mint-rep-coupons";
import { createLogger } from "@tiffin/commons/logger";

const log = createLogger("mint-rep-coupons");

// Manual / external-scheduler trigger for the rep daily-coupon mint. Runs the
// SAME logic as the protected cron route (no HTTP, no CRON_SECRET) so it can be
// invoked by hand or wired into any external scheduler:
//   tsx --env-file=.env db/mint-rep-coupons.ts
async function main() {
  const summary = await mintRepCoupons();
  console.log(JSON.stringify(summary));
  process.exit(0);
}

main().catch((e) => {
  log.error({ err: e }, "mint failed");
  process.exit(1);
});
