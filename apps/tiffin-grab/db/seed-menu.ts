import { eq } from "drizzle-orm";
import { db } from "./client";
import { dishes, mealSlots, menuItems, menuWeeks } from "./schema";
import { createLogger } from "@realm/commons/logger";

const log = createLogger("seed-menu");

const SLOTS = [
  { planType: "tiffin" as const, key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
  { planType: "healthy" as const, key: "breakfast", label: "Breakfast", enabled: true, sortOrder: 0 },
  { planType: "healthy" as const, key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
  { planType: "healthy" as const, key: "dinner", label: "Dinner", enabled: true, sortOrder: 2 },
];

const DISHES = [
  { name: "Dal Tadka", description: "Yellow lentils tempered with cumin and garlic", diet: "veg" as const, slots: ["lunch"] },
  { name: "Paneer Butter Masala", description: "Paneer in a rich tomato-cream sauce", diet: "veg" as const, slots: ["lunch"] },
  { name: "Aloo Gobi", description: "Potato and cauliflower dry sabzi", diet: "veg" as const, slots: ["lunch"] },
  { name: "Chicken Curry", description: "Tender chicken in a spiced onion-tomato gravy", diet: "nonveg" as const, slots: ["lunch"] },
  { name: "Egg Bhurji", description: "Spiced scrambled eggs with onion and peppers", diet: "nonveg" as const, slots: ["lunch"] },
];

const DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;

function nextMonday(from: Date): Date {
  const d = new Date(from);
  const day = d.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return d;
}

async function main() {
  for (const s of SLOTS) {
    await db.insert(mealSlots).values(s).onConflictDoNothing({ target: [mealSlots.planType, mealSlots.key] });
  }
  log.info(`Seeded ${SLOTS.length} meal slots`);

  const dishIds: bigint[] = [];
  for (const d of DISHES) {
    const existing = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.name, d.name)).limit(1);
    if (existing.length > 0) {
      dishIds.push(existing[0].id);
    } else {
      const [inserted] = await db.insert(dishes).values(d).returning({ id: dishes.id });
      dishIds.push(inserted.id);
    }
  }
  log.info(`Seeded ${DISHES.length} dishes`);

  const weekStart = nextMonday(new Date());
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const orderCutoff = new Date(weekStart);
  orderCutoff.setUTCDate(orderCutoff.getUTCDate() - 1);

  const existingWeek = await db
    .select({ id: menuWeeks.id })
    .from(menuWeeks)
    .where(eq(menuWeeks.weekStart, weekStartStr))
    .limit(1);

  if (existingWeek.length > 0) {
    log.info(`Menu week ${weekStartStr} already exists — skipping week + items`);
    return;
  }

  const [week] = await db
    .insert(menuWeeks)
    .values({ planType: "tiffin", weekStart: weekStartStr, status: "released", orderCutoff: orderCutoff.getTime() })
    .returning({ id: menuWeeks.id });

  log.info(`Seeded menu week ${weekStartStr} (released)`);

  for (const day of DAYS) {
    for (let i = 0; i < dishIds.length; i++) {
      await db
        .insert(menuItems)
        .values({
          menuWeekId: week.id,
          dayOfWeek: day,
          slot: "lunch",
          dishId: dishIds[i],
          isDefault: i === 0,
          position: i,
        })
        .onConflictDoNothing();
    }
  }
  log.info(`Seeded menu items for mon–fri lunch (${dishIds.length} dishes × ${DAYS.length} days)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { log.error({ err: e }, "seed failed"); process.exit(1); });
