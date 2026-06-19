import { db } from "./client";
import { mealSlots } from "./schema";

const SLOTS = [
  { key: "breakfast", label: "Breakfast", enabled: false, sortOrder: 0 },
  { key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
  { key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
];

async function main() {
  for (const s of SLOTS) {
    await db.insert(mealSlots).values(s).onConflictDoNothing({ target: mealSlots.key });
  }
  console.log(`Seeded ${SLOTS.length} meal slots`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
