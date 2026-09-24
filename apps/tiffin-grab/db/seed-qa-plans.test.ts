/**
 * Local QA seed: fills the catalog that db/seed.sql already loads (the "New Plans & Pricing" sheet)
 * with dishes, releases a dummy menu for this week and next, and creates one customer with a live
 * 20-day (4 x Mon-Fri) subscription per meal size. It does NOT touch categories, meal sizes or swap
 * pairs: seed.sql owns those. Idempotent by (dish name, plan) / week / email.
 * A seeding SCRIPT, not a test — excluded from the default run (see vitest.config.ts):
 *   pnpm --filter tiffin-grab exec vitest run --config vitest.seed.config.ts db/seed-qa-plans.test.ts
 *
 * Logins (password Customer123!): qa.<meal_size_key>@tiffingrab.test, plus
 * customer@tiffingrab.ca on Non-Veg 4 Item Thali - Regular (the Playwright customer).
 */
import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { cutoffMsFor, nextWeekday, parseIsoDateUtc, zonedDateIso } from "@foundry/commons";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/db/client";
import {
  account, dishCategories, dishes, menuItems, menuWeeks, orders, plans, users,
} from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { createOrder } from "@/lib/services/orders.service";
import { assertLocalDb } from "./is-local-db";

// The password below is committed to a public repo — never seed it anywhere but local.
assertLocalDb("seed-qa-plans");

const PASSWORD = "Customer123!";
type Diet = "veg" | "non-veg";
const BOTH: Diet[] = ["veg", "non-veg"];
// A dish belongs to exactly one plan now — "shared" dishes (Sabzi that both diets
// eat) are two rows, one per plan, same name+category. Non-veg curries are Sabzi
// dishes on the non-veg plan only (seed.sql merged the old Curry category into Sabzi).
const DISHES: { name: string; category: string; description: string; plans: Diet[] }[] = [
  { name: "Aloo Gobi", category: "sabzi", description: "Potato and cauliflower dry sabzi", plans: BOTH },
  { name: "Paneer Butter Masala", category: "sabzi", description: "Paneer in a rich tomato-cream sauce", plans: BOTH },
  { name: "Bhindi Masala", category: "sabzi", description: "Okra sautéed with onion and spices", plans: BOTH },
  { name: "Mix Veg", category: "sabzi", description: "Seasonal vegetables in a light masala", plans: BOTH },
  { name: "Palak Paneer", category: "sabzi", description: "Paneer in spinach gravy", plans: BOTH },
  { name: "Baingan Bharta", category: "sabzi", description: "Smoky mashed eggplant", plans: BOTH },
  { name: "Matar Paneer", category: "sabzi", description: "Peas and paneer curry", plans: BOTH },
  { name: "Dal Tadka", category: "daal", description: "Yellow lentils tempered with cumin and garlic", plans: BOTH },
  { name: "Tur Dal", category: "daal", description: "Pigeon-pea lentils", plans: BOTH },
  { name: "Lobia Masala", category: "daal", description: "Black-eyed peas in masala", plans: BOTH },
  { name: "Rajma", category: "daal", description: "Kidney beans in onion-tomato gravy", plans: BOTH },
  { name: "Kadhi", category: "daal", description: "Yoghurt and gram-flour curry", plans: BOTH },
  { name: "Chana Masala", category: "daal", description: "Chickpeas in a tangy masala", plans: BOTH },
  { name: "Chicken Curry", category: "sabzi", description: "Tender chicken in a spiced onion-tomato gravy", plans: ["non-veg"] },
  { name: "Butter Chicken", category: "sabzi", description: "Chicken in a buttery tomato sauce", plans: ["non-veg"] },
  { name: "Egg Curry", category: "sabzi", description: "Boiled eggs in masala gravy", plans: ["non-veg"] },
  { name: "Goat Curry", category: "sabzi", description: "Slow-cooked goat on the bone", plans: ["non-veg"] },
  { name: "Keema Matar", category: "sabzi", description: "Minced chicken with peas", plans: ["non-veg"] },
  { name: "Jeera Rice", category: "rice", description: "Basmati rice tempered with cumin", plans: BOTH },
  { name: "Plain Basmati Rice", category: "rice", description: "Steamed basmati", plans: BOTH },
  { name: "Roti", category: "roti", description: "Soft whole-wheat flatbread", plans: BOTH },
  { name: "Boondi Raita", category: "raita", description: "Whisked yoghurt with gram-flour pearls", plans: BOTH },
  { name: "Cucumber Raita", category: "raita", description: "Yoghurt with grated cucumber", plans: BOTH },
  { name: "Kachumber Salad", category: "salad", description: "Cucumber, tomato and onion with lemon", plans: BOTH },
  { name: "Green Salad", category: "salad", description: "Lettuce, carrot and cucumber", plans: BOTH },
];
// Options offered per day, rotated so each weekday's menu differs. Sabzi is the only selectable
// category (3 shared + 1 non-veg-only, so every plan can fill a 3-sabzi tiffin); fixed categories get
// exactly one dish — menuService.releaseProblems rejects a second as dead surplus.
const PER_DAY: Record<string, number> = { sabzi: 4, daal: 1, rice: 1, roti: 1, raita: 1, salad: 1 };
const POSTAL = [
  ["100 Queen St W", "Toronto", "M5H 2N2"], ["290 Bremner Blvd", "Toronto", "M5V 3L9"], ["5100 Erin Mills Pkwy", "Mississauga", "L5M 4Z5"],
  ["25 Peel Centre Dr", "Brampton", "L6T 3R5"], ["300 Borough Dr", "Scarborough", "M1P 4P5"], ["5000 Yonge St", "North York", "M2N 7E9"],
  ["5000 Hwy 7", "Markham", "L3R 4M9"], ["1 Bass Pro Mills Dr", "Vaughan", "L4K 5W4"],
] as const;

describe("seed QA plans", () => {
  it("aligns catalog, releases menus and creates one customer per plan", async () => {
    const planRows = await db.select({ id: plans.id, key: plans.key }).from(plans).where(inArray(plans.key, BOTH));
    const planId = Object.fromEntries(planRows.map((p) => [p.key, p.id])) as Record<Diet, bigint>;
    expect(planId.veg && planId["non-veg"]).toBeTruthy();

    const catRows = await db.select({ id: dishCategories.id, key: dishCategories.key }).from(dishCategories);
    const catId = new Map(catRows.map((c) => [c.key, c.id]));

    // ---- dishes: one row per (name, plan) pair
    const dishId = new Map<string, bigint>(); // keyed "name|planKey"
    for (const d of DISHES) {
      for (const planKey of d.plans) {
        const pid = planId[planKey];
        let [row] = await db.select({ id: dishes.id }).from(dishes)
          .where(and(eq(dishes.name, d.name), eq(dishes.planId, pid))).limit(1);
        if (row) await db.update(dishes).set({ category: d.category, description: d.description, active: true }).where(eq(dishes.id, row.id));
        else [row] = await db.insert(dishes).values({ name: d.name, category: d.category, description: d.description, planId: pid }).returning({ id: dishes.id });
        dishId.set(`${d.name}|${planKey}`, row.id);
      }
    }

    // ---- menu: this week + next, Mon–Fri
    const { timezone, cutoffHour } = await getAppSettings();
    const thisMonday = mondayOfIso(zonedDateIso(Date.now(), timezone));
    const nextMonday = parseIsoDateUtc(thisMonday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    const DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
    for (const weekStart of [thisMonday, nextMonday.toISOString().slice(0, 10)]) {
      let [week] = await db.select({ id: menuWeeks.id, publicId: menuWeeks.publicId }).from(menuWeeks).where(eq(menuWeeks.weekStart, weekStart)).limit(1);
      const weekValues = { status: "released" as const, orderCutoff: cutoffMsFor(weekStart, cutoffHour, timezone), releasedAt: Date.now() };
      if (week) await db.update(menuWeeks).set(weekValues).where(eq(menuWeeks.id, week.id));
      else [week] = await db.insert(menuWeeks).values({ weekStart, ...weekValues }).returning({ id: menuWeeks.id, publicId: menuWeeks.publicId });
      await db.delete(menuItems).where(eq(menuItems.menuWeekId, week.id));
      const rows: (typeof menuItems.$inferInsert)[] = [];
      DAYS.forEach((day, dayIdx) => {
        for (const [category, perDay] of Object.entries(PER_DAY)) {
          const shared = DISHES.filter((d) => d.category === category && d.plans.length === BOTH.length);
          const nonVegOnly = DISHES.filter((d) => d.category === category && d.plans.length < BOTH.length);
          const picks = [
            ...Array.from({ length: Math.min(perDay, shared.length, 3) }, (_, i) => shared[(dayIdx + i) % shared.length]),
            ...(perDay > 3 && nonVegOnly.length ? [nonVegOnly[dayIdx % nonVegOnly.length]] : []),
          ];
          for (const [i, dish] of picks.entries()) {
            for (const planKey of dish.plans) {
              rows.push({
                menuWeekId: week.id, dayOfWeek: day, categoryId: catId.get(category)!,
                dishId: dishId.get(`${dish.name}|${planKey}`)!, isDefault: i === 0, position: i,
              });
            }
          }
        }
      });
      await db.insert(menuItems).values(rows);
      const problems = await menuService.releaseProblems(week.publicId);
      expect(problems, `menu ${weekStart} is not servable: ${JSON.stringify(problems)}`).toEqual([]);
    }
    await menuService.evictPublishedCache();

    // ---- customers: one live 20-day subscription per meal size
    const snap = await loadCatalogSnapshot();
    const startDate = nextWeekday(new Date()).toISOString().slice(0, 10);
    const password = await hashPassword(PASSWORD);
    const logins: { email: string; plan: string; size: string; order: string }[] = [];
    const planKeyById = new Map(snap.plans.map((p) => [p.id, p.key]));
    const sized = snap.mealSizes.filter((m) => !m.trial).map((m) => ({
      key: m.key, name: m.name, plan: planKeyById.get(m.planId) as Diet, publicId: m.publicId,
    }));
    const playwrightSize = sized.find((m) => m.key === "item4_regular_nonveg")!;
    const accounts = [
      ...sized.map((s) => ({ email: `qa.${s.key}@tiffingrab.test`, name: `QA ${s.plan === "veg" ? "Veg" : "Non-Veg"} ${s.name}`, size: s })),
      { email: "customer@tiffingrab.ca", name: "QA Customer", size: playwrightSize },
    ];
    for (const [i, a] of accounts.entries()) {
      const phone = `+1647555${String(200 + i).padStart(4, "0")}`;
      let [user] = await db.select({ id: users.id, publicId: users.publicId }).from(users).where(eq(users.email, a.email)).limit(1);
      if (!user) {
        [user] = await db.insert(users).values({ name: a.name, email: a.email, phone, emailVerified: true, role: "user", passwordSet: true })
          .returning({ id: users.id, publicId: users.publicId });
      }
      const [cred] = await db.select({ id: account.id }).from(account).where(eq(account.userId, user.id)).limit(1);
      if (cred) await db.update(account).set({ password }).where(eq(account.id, cred.id));
      else await db.insert(account).values({ accountId: String(user.id), providerId: "credential", userId: user.id, password });

      const [live] = await db.select({ deploymentId: orders.deploymentId }).from(orders)
        .where(and(eq(orders.userId, user.id), inArray(orders.status, ["active", "paused"]))).limit(1);
      let deploymentId = live?.deploymentId;
      if (!deploymentId) {
        const [addressLine, city, postalCode] = POSTAL[i % POSTAL.length];
        ({ deploymentId } = await createOrder({
          planKey: a.size.plan,
          selections: {
            mealSizeId: a.size.publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
            includeSaturday: false, includeSunday: false, durationWeeks: 4, startDate,
          },
          contact: { email: a.email, fullName: a.name, phone, addressLine, city, postalCode },
        }, { ownerUserId: user.publicId }));
      }
      logins.push({ email: a.email, plan: a.size.plan, size: a.size.name, order: deploymentId! });
    }
    // eslint-disable-next-line no-console
    console.table(logins);
    expect(logins).toHaveLength(accounts.length);
  }, 300_000);
});
