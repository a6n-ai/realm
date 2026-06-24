import { db } from "./client";
import { appSettings, featureFlags } from "./schema";
import { seedLeadSources } from "./seed-sources";

const FLAGS = [
  { key: "subscription_wizard", label: "Subscription Wizard", description: "Access the plan builder", defaultEnabled: true },
  { key: "admin_console", label: "Admin Console", description: "User & flag administration", defaultEnabled: false },
];

async function main() {
  await seedLeadSources();
  for (const f of FLAGS) {
    await db.insert(featureFlags).values(f).onConflictDoNothing({ target: featureFlags.key });
  }
  console.log(`Seeded ${FLAGS.length} feature flags`);
  const [existing] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (!existing) await db.insert(appSettings).values({ timezone: "America/Toronto", cutoffHour: 18 });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
