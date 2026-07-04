import { db } from "./client";
import { appEvent, coinRate, eventPayout } from "./schema";
import { createLogger } from "@realm/commons/logger";

const log = createLogger("seed-wallet");

async function main() {
  for (const ev of appEvent.enumValues) {
    await db.insert(eventPayout).values({ eventType: ev, enabled: false, coins: 0 })
      .onConflictDoNothing({ target: eventPayout.eventType });
  }
  await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.1000" });
  log.info("wallet seeded");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { log.error({ err: e }, "seed failed"); process.exit(1); });
