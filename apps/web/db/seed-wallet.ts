import { db } from "./client";
import { businessEvent, coinRate, eventPayout } from "./schema";

async function main() {
  for (const ev of businessEvent.enumValues) {
    await db.insert(eventPayout).values({ eventType: ev, enabled: false, coins: 0 })
      .onConflictDoNothing({ target: eventPayout.eventType });
  }
  await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.1000" });
  console.log("wallet seeded");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
