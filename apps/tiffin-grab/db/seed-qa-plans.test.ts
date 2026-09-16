/**
 * Local QA seed for the "New Plans & Pricing for Traditional Items" sheet: aligns the
 * catalog to it, releases a dummy menu for this week and next, and creates one customer
 * with a live 20-day (4 × Mon–Fri) subscription per meal size. Idempotent by key/email.
 * A seeding SCRIPT, not a test — excluded from the default run (see vitest.config.ts):
 *   pnpm --filter tiffin-grab exec vitest run --config vitest.seed.config.ts db/seed-qa-plans.test.ts
 *
 * Logins (password Customer123!): qa.<meal_size_key>@tiffingrab.test, plus
 * customer@tiffingrab.ca on Non-Veg 4 Item Thali — Regular (the Playwright customer).
 */
import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { cutoffMsFor, nextWeekday, parseIsoDateUtc, zonedDateIso } from "@foundry/commons";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/db/client";
import {
  account, categoryPlans, dishCategories, dishPlans, dishes, mealSizeItems, mealSizes, menuItems, menuWeeks, orders, plans, users,
} from "@/db/schema";
import { invalidateCatalogSnapshot, loadCatalogSnapshot } from "@/lib/catalog/load";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { menuService } from "@/lib/services/menu.service";
import { createOrder } from "@/lib/services/orders.service";
import { sql } from "drizzle-orm";
import { assertLocalDb } from "./is-local-db";

// The password below is committed to a public repo — never seed it anywhere but local.
assertLocalDb("seed-qa-plans");

const PASSWORD = "Customer123!";
type Diet = "veg" | "non-veg";
type Item = readonly [category: string, tu: number];

const S8: Item = ["sabzi", 1];
const S12: Item = ["sabzi", 1.5];
const D8: Item = ["daal", 1];
const D12: Item = ["daal", 1.5];
const C8: Item = ["curry", 1];
const C12: Item = ["curry", 1.5];
const RICE: Item = ["rice", 1];
const SALAD: Item = ["salad", 1];
const RAITA: Item = ["raita", 1];
const rotis = (n: number): Item[] => Array.from({ length: n }, () => ["roti", 0.25] as const);

// Sheet prices are for 20 days; base_price is per tiffin, so each is sheet ÷ 20.
// Non-veg variants trade the first sabzi for a non-veg curry of the same portion.
const SIZES: { key: string; name: string; plan: Diet; tier: "budget" | "medium" | "premium"; perTiffin: number; items: Item[] }[] = [
  { key: "small_thali", name: "Small Thali", plan: "veg", tier: "budget", perTiffin: 9.0, items: [S12, RICE, ...rotis(2)] },
  { key: "sabzi_only_veg", name: "Sabzi Only — Regular", plan: "veg", tier: "budget", perTiffin: 9.0, items: [S8, S8, D8] },
  { key: "sabzi_only_nonveg", name: "Sabzi Only — Regular", plan: "non-veg", tier: "budget", perTiffin: 10.0, items: [C8, S8, D8] },
  { key: "sabzi_only_large_veg", name: "Sabzi Only — Large", plan: "veg", tier: "budget", perTiffin: 10.5, items: [S12, S12, S8] },
  { key: "sabzi_only_large_nonveg", name: "Sabzi Only — Large", plan: "non-veg", tier: "budget", perTiffin: 11.5, items: [C12, S12, S8] },
  { key: "veg_4_regular", name: "4 Item Thali — Regular", plan: "veg", tier: "medium", perTiffin: 10.0, items: [S8, D8, RICE, ...rotis(2)] },
  { key: "nonveg_4_regular", name: "4 Item Thali — Regular", plan: "non-veg", tier: "medium", perTiffin: 11.0, items: [C8, D8, RICE, ...rotis(2)] },
  { key: "veg_4_large", name: "4 Item Thali — Large", plan: "veg", tier: "medium", perTiffin: 11.5, items: [S12, D12, RICE, ...rotis(4)] },
  { key: "nonveg_4_large", name: "4 Item Thali — Large", plan: "non-veg", tier: "medium", perTiffin: 12.5, items: [C12, D12, RICE, ...rotis(4)] },
  { key: "veg_5_regular", name: "5 Item Thali — Regular", plan: "veg", tier: "medium", perTiffin: 11.0, items: [S8, S8, D8, RICE, ...rotis(3)] },
  { key: "nonveg_5_regular", name: "5 Item Thali — Regular", plan: "non-veg", tier: "medium", perTiffin: 12.0, items: [C8, S8, D8, RICE, ...rotis(3)] },
  { key: "new_plan_veg", name: "New Thali Plan — Regular", plan: "veg", tier: "medium", perTiffin: 11.5, items: [S8, D8, ...rotis(8)] },
  { key: "new_plan_nonveg", name: "New Thali Plan — Regular", plan: "non-veg", tier: "medium", perTiffin: 12.5, items: [C8, D8, ...rotis(8)] },
  { key: "veg_5_large", name: "5 Item Thali — Large", plan: "veg", tier: "premium", perTiffin: 13.0, items: [S12, D12, S8, RICE, ...rotis(6)] },
  { key: "nonveg_5_large", name: "5 Item Thali — Large", plan: "non-veg", tier: "premium", perTiffin: 14.0, items: [C12, D12, S8, RICE, ...rotis(6)] },
  { key: "maharaja_veg", name: "Maharaja Thali", plan: "veg", tier: "premium", perTiffin: 14.0, items: [S12, D12, S8, SALAD, RAITA, RICE, ...rotis(8)] },
  { key: "maharaja_nonveg", name: "Maharaja Thali", plan: "non-veg", tier: "premium", perTiffin: 14.75, items: [C12, D12, S8, SALAD, RAITA, RICE, ...rotis(8)] },
];

const KCAL = { budget: [450, 650], medium: [650, 900], premium: [900, 1300] } as const;
const ITEM_NAME: Record<string, string> = { sabzi: "Sabzi", daal: "Daal", curry: "Curry", rice: "Rice", roti: "Roti", salad: "Salad", raita: "Raita" };

const BOTH: Diet[] = ["veg", "non-veg"];
// Veg curries (paneer etc.) are Sabzi; the Curry category is non-veg only, attached only to
// the non-veg plan, and capped at one pick per tiffin.
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
  { name: "Chicken Curry", category: "curry", description: "Tender chicken in a spiced onion-tomato gravy", plans: ["non-veg"] },
  { name: "Butter Chicken", category: "curry", description: "Chicken in a buttery tomato sauce", plans: ["non-veg"] },
  { name: "Egg Curry", category: "curry", description: "Boiled eggs in masala gravy", plans: ["non-veg"] },
  { name: "Goat Curry", category: "curry", description: "Slow-cooked goat on the bone", plans: ["non-veg"] },
  { name: "Keema Matar", category: "curry", description: "Minced chicken with peas", plans: ["non-veg"] },
  { name: "Jeera Rice", category: "rice", description: "Basmati rice tempered with cumin", plans: BOTH },
  { name: "Plain Basmati Rice", category: "rice", description: "Steamed basmati", plans: BOTH },
  { name: "Roti", category: "roti", description: "Soft whole-wheat flatbread", plans: BOTH },
  { name: "Boondi Raita", category: "raita", description: "Whisked yoghurt with gram-flour pearls", plans: BOTH },
  { name: "Cucumber Raita", category: "raita", description: "Yoghurt with grated cucumber", plans: BOTH },
  { name: "Kachumber Salad", category: "salad", description: "Cucumber, tomato and onion with lemon", plans: BOTH },
  { name: "Green Salad", category: "salad", description: "Lettuce, carrot and cucumber", plans: BOTH },
];
// Options offered per day, rotated so each weekday's menu differs. Fixed (non-selectable)
// categories get exactly one — menuService.releaseProblems rejects a second as dead surplus.
const PER_DAY: Record<string, number> = { sabzi: 4, daal: 3, curry: 3, rice: 1, roti: 1, raita: 1, salad: 1 };
const SWAP_PAIRS: [string, string][] = [["sabzi", "daal"], ["daal", "sabzi"], ["sabzi", "curry"], ["curry", "sabzi"], ["daal", "curry"], ["curry", "daal"]];
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

    // ---- categories + swap pairs
    await db.update(dishCategories).set({ selectable: true }).where(eq(dishCategories.key, "daal"));
    await db.update(dishCategories).set({ label: "Non-Veg Curry", selectable: true, maxPicksPerTiffin: 1 }).where(eq(dishCategories.key, "curry"));
    const catRows = await db.select({ id: dishCategories.id, key: dishCategories.key }).from(dishCategories);
    const catId = new Map(catRows.map((c) => [c.key, c.id]));
    await db.delete(categoryPlans).where(and(eq(categoryPlans.categoryId, catId.get("curry")!), eq(categoryPlans.planId, planId.veg)));
    for (const [from, to] of SWAP_PAIRS) {
      if (!(await dishCategoriesService.isSwapPairAllowed(from, to))) await dishCategoriesService.addSwapPair(from, to);
    }

    // ---- dishes
    const dishId = new Map<string, bigint>();
    for (const d of DISHES) {
      let [row] = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.name, d.name)).limit(1);
      if (row) await db.update(dishes).set({ category: d.category, description: d.description, active: true }).where(eq(dishes.id, row.id));
      else [row] = await db.insert(dishes).values({ name: d.name, category: d.category, description: d.description }).returning({ id: dishes.id });
      await db.delete(dishPlans).where(eq(dishPlans.dishId, row.id));
      await db.insert(dishPlans).values(d.plans.map((p) => ({ dishId: row.id, planId: planId[p] })));
      dishId.set(d.name, row.id);
    }

    // ---- meal sizes (per the sheet)
    for (const s of SIZES) {
      const values = {
        name: s.name, planId: planId[s.plan], tier: s.tier, basePrice: s.perTiffin.toFixed(2),
        kcalMin: KCAL[s.tier][0], kcalMax: KCAL[s.tier][1], active: true, trial: false,
      };
      let [row] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.key, s.key)).limit(1);
      if (row) await db.update(mealSizes).set(values).where(eq(mealSizes.id, row.id));
      else [row] = await db.insert(mealSizes).values({ key: s.key, ...values }).returning({ id: mealSizes.id });
      await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, row.id));
      await db.insert(mealSizeItems).values(s.items.map(([category, tu], i) => ({
        mealSizeId: row.id, name: ITEM_NAME[category], category, tuAmount: tu.toFixed(2), sortOrder: i,
      })));
    }
    // Trial sizes aren't on the sheet.
    await db.update(mealSizes).set({ active: false }).where(inArray(mealSizes.key, ["trial_veg", "trial_nonveg"]));
    // Same derivation seed.sql uses for the human components[] list.
    await db.execute(sql`
      UPDATE meal_sizes ms SET components = COALESCE((
        SELECT json_agg(g.cnt || '× ' || g.name ORDER BY g.min_sort)
        FROM (SELECT name, COUNT(*) AS cnt, MIN(sort_order) AS min_sort FROM meal_size_items WHERE meal_size_id = ms.id GROUP BY name) g
      ), '[]'::json)::jsonb`);
    await invalidateCatalogSnapshot();

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
          const pool = DISHES.filter((d) => d.category === category);
          for (let i = 0; i < Math.min(perDay, pool.length); i++) {
            const dish = pool[(dayIdx + i) % pool.length];
            rows.push({ menuWeekId: week.id, dayOfWeek: day, categoryId: catId.get(category)!, dishId: dishId.get(dish.name)!, isDefault: i === 0, position: i });
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
    const accounts = [
      ...SIZES.map((s) => ({ email: `qa.${s.key}@tiffingrab.test`, name: `QA ${s.plan === "veg" ? "Veg" : "Non-Veg"} ${s.name}`, size: s })),
      { email: "customer@tiffingrab.ca", name: "QA Customer", size: SIZES.find((s) => s.key === "nonveg_4_regular")! },
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
        const size = snap.mealSizes.find((m) => m.key === a.size.key)!;
        const [addressLine, city, postalCode] = POSTAL[i % POSTAL.length];
        ({ deploymentId } = await createOrder({
          planKey: a.size.plan,
          selections: {
            mealSizeId: size.publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
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
