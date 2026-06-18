import { db } from "./client";
import { featureFlags } from "./schema";

const FLAGS = [
  { key: "subscription_wizard", label: "Subscription Wizard", description: "Access the plan builder", defaultEnabled: true },
  { key: "admin_console", label: "Admin Console", description: "User & flag administration", defaultEnabled: false },
];

async function main() {
  for (const f of FLAGS) {
    await db.insert(featureFlags).values(f).onConflictDoNothing({ target: featureFlags.key });
  }
  console.log(`Seeded ${FLAGS.length} feature flags`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
