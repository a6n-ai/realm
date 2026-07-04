import { eq } from "drizzle-orm";
import { db } from "./client";
import { DEFAULT_MEAL_TYPES } from "@/lib/menu/meal-types";
import { appSettings, featureFlags } from "./schema";
import { seedLeadSources } from "./seed-sources";
import { createLogger } from "@tiffin/commons/logger";

const log = createLogger("seed");

const FLAGS = [
  { key: "subscription_wizard", label: "Subscription Wizard", description: "Access the plan builder", defaultEnabled: true },
  { key: "admin_console", label: "Admin Console", description: "User & flag administration", defaultEnabled: false },
];

async function main() {
  await seedLeadSources();
  for (const f of FLAGS) {
    await db.insert(featureFlags).values(f).onConflictDoNothing({ target: featureFlags.key });
  }
  log.info(`Seeded ${FLAGS.length} feature flags`);
  const [row] = await db.select({ publicId: appSettings.publicId, mealTypes: appSettings.mealTypes }).from(appSettings).limit(1);
  if (!row) await db.insert(appSettings).values({ timezone: "America/Toronto", cutoffHour: 18, mealTypes: DEFAULT_MEAL_TYPES });
  else if (!row.mealTypes) await db.update(appSettings).set({ mealTypes: DEFAULT_MEAL_TYPES }).where(eq(appSettings.publicId, row.publicId));
  process.exit(0);
}

main().catch((e) => {
  log.error({ err: e }, "seed failed");
  process.exit(1);
});
