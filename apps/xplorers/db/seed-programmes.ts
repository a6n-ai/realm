/**
 * One-off, idempotent seed: the Xplorers.Life programmes and price table from docs/xlp.pdf.
 * Skips any class whose title already exists. Private Workshops are not seeded.
 * App timezone/currency/default prices are written only while app.default_prices is null (first run).
 * Then materialises sessions (ensureHorizon needs no signed-in user, so the service is called as-is).
 *
 * Run (local DB only):
 *   DATABASE_URL=postgres://localhost:5432/xplorers pnpm --filter xplorers exec tsx db/seed-programmes.ts
 */
import { eq } from "drizzle-orm";
import { db } from "./client";
import { app, studioSessions } from "./schema";
import { DEFAULT_PRICE_TABLE } from "@/lib/pricing/defaults";
import type { ClassPricing, PriceTable } from "@/lib/pricing/types";
import type { RepeatPattern } from "@/lib/sessions/pattern";
import { dayKey } from "@/lib/sessions/timezone";

const ZONE = "Asia/Singapore";
const same = (n: number) => ({ weekday: n, weekend: n });

type Seed = typeof studioSessions.$inferInsert;

const none: ClassPricing = { mode: "length", defaultLengthMinutes: 90, options: [], extension: null, adults: { free: 0, extraPrice: null } };

const pattern = (p: Omit<RepeatPattern, "startsOn" | "endsOn" | "excludeMonths" | "nthOfMonth"> & Partial<RepeatPattern>, startsOn: string): RepeatPattern => ({
  nthOfMonth: null,
  endsOn: null,
  excludeMonths: [],
  ...p,
  startsOn,
});

function programmes(today: string): Seed[] {
  return [
    {
      title: "After-School Explore & Play",
      category: "kids",
      color: "sky",
      sortOrder: 1,
      capacity: 6,
      groupSize: "Small groups of 4–6 · Max. 6",
      scheduleLine: "Mon, Tue, Thu & Fri · 2–6pm",
      ageMin: 3,
      ageMax: 6,
      summary:
        "Our in-house, weekly themed discovery curriculum invites children to explore science, making and creative play. Guided by their interests and curiosity, each day brings different hands-on projects and playful discoveries.",
      included:
        "Younger children, and children who need additional support, may attend with one parent or caregiver at no extra charge, subject to available space. Please let us know when booking so we can plan for them. The accompanying adult shares the child's activities and materials; separate adult projects or food portions are charged additionally, with the price agreed beforehand.",
      pricing: { mode: "length", defaultLengthMinutes: 90, options: [], extension: null, adults: { free: 1, extraPrice: null } },
      pattern: pattern({ weekdays: [1, 2, 4, 5], startClock: "14:00", endClock: "18:00" }, today),
    },
    {
      title: "Think Like a Scientist",
      category: "kids",
      color: "blue",
      sortOrder: 2,
      capacity: 8,
      scheduleLine: "1st & 3rd Wed · 4:30–6pm",
      ageMin: 7,
      ageMax: 12,
      summary: "Observe, wonder, test and discover. Excludes June and December; food sessions may finish at 6:30pm.",
      pricing: { ...none, defaultLengthMinutes: 90 },
      prices: { "len:90": same(68) },
      pattern: pattern({ weekdays: [3], nthOfMonth: [1, 3], excludeMonths: [6, 12], startClock: "16:30", endClock: "18:00" }, today),
    },
    {
      title: "Sensory Discovery, Craft & Play",
      category: "kids",
      color: "purple",
      sortOrder: 3,
      capacity: 8,
      scheduleLine: "Sunday · 9:30am start · 9am by prior arrangement",
      summary: "One craft, sensory play, light snacks & drinks. Explore sensory bins, bamboo water play, colour stations and cardboard machines.",
      included:
        "Creative activities may include drawing, painting and more, depending on the session. Sunday: S$78 for 90 minutes for one child and one adult, or S$88 Family Upgrade for 2 hours for one child and up to two adults. Both include one craft, sensory play, light snacks and drinks. Additional playtime: S$10 per child per 30 minutes, subject to availability and space. Starts at 9:30am; 9am by prior arrangement. Bring a change of clothes and a towel. Please share dietary requirements when booking.",
      pricing: {
        mode: "options",
        defaultLengthMinutes: 90,
        options: [
          { key: "standard", label: "Standard", lengthMinutes: 90, adultsIncluded: 1 },
          { key: "family", label: "Family Upgrade", lengthMinutes: 120, adultsIncluded: 2 },
        ],
        extension: { stepMinutes: 30, price: same(10) },
        adults: { free: 0, extraPrice: null },
      },
      prices: { "opt:standard": same(78), "opt:family": same(88) },
      pattern: pattern({ weekdays: [7], startClock: "09:30", endClock: "12:00" }, today),
    },
    {
      title: "Bake, Cook & Discover!",
      category: "kids",
      color: "orange",
      sortOrder: 4,
      capacity: 6,
      groupSize: "Small groups of 4–6 · Max. 6",
      scheduleLine: "Every Saturday · 2:30–4:30pm",
      summary:
        "Hands-on kitchen fun for curious children. Practise measuring, discover food science and build confidence making something yummy.",
      included: "Ingredients included. Some projects may need a little extra time; we'll confirm the finish time when booking.",
      pricing: { ...none, defaultLengthMinutes: 120 },
      prices: { "len:120": same(98) },
      pattern: pattern({ weekdays: [6], startClock: "14:30", endClock: "16:30" }, today),
    },
    {
      title: "Make a Toy / Woodwork Club",
      category: "kids",
      color: "green",
      sortOrder: 5,
      capacity: 8,
      groupSize: "Usually 6–8",
      scheduleLine: "Fri–Sun · 6–9pm (extensions available)",
      summary:
        "Explore the tools. Learn the skills. Create something of your own. Taster: 1 hour for S$48. Regular: 2 hours for S$78, recommended for beginners and projects of easy-to-medium difficulty.",
      included:
        "Extend or return to continue the same project for S$30 per hour, subject to availability. Standard project materials included; additional materials quoted separately. Completion depends on the design and each participant's pace. Book up to 3 calendar months ahead; last-minute bookings welcome, subject to confirmation. Earlier starts by arrangement. Extensions after 9pm available on Fridays and Saturdays until 11pm.",
      pricing: {
        mode: "options",
        defaultLengthMinutes: 60,
        options: [
          { key: "taster", label: "Taster", lengthMinutes: 60, adultsIncluded: 0 },
          { key: "regular", label: "Regular", lengthMinutes: 120, adultsIncluded: 0 },
        ],
        extension: { stepMinutes: 60, price: same(30) },
        adults: { free: 0, extraPrice: null },
      },
      prices: { "opt:taster": same(48), "opt:regular": same(78) },
      pattern: pattern({ weekdays: [5, 6, 7], startClock: "18:00", endClock: "21:00" }, today),
    },
    {
      title: "Camps for Fun",
      category: "kids",
      color: "yellow",
      sortOrder: 6,
      capacity: 1,
      bookingType: "enquire_only",
      scheduleLine: "School holidays & weekends · Dates and times announced separately",
      summary: "More time to experiment, make, explore and enjoy new experiences together. Ask us about upcoming camps.",
      pricing: none,
    },
  ].map((c) => ({ published: true, ...c }) as Seed);
}

async function main() {
  const [settings] = await db.select({ id: app.id, defaultPrices: app.defaultPrices }).from(app).limit(1);
  if (!settings) throw new Error("no app row — run seed-admin.ts first");
  if (settings.defaultPrices) {
    console.log("app settings: exists, left unchanged");
  } else {
    await db.update(app).set({ timezone: ZONE, currency: "SGD", defaultPrices: DEFAULT_PRICE_TABLE as PriceTable }).where(eq(app.id, settings.id));
    console.log(`app settings: ${ZONE}, SGD, default prices`);
  }

  const today = dayKey(new Date(), ZONE);
  const created: string[] = [];
  for (const row of programmes(today)) {
    const [existing] = await db.select({ id: studioSessions.id }).from(studioSessions).where(eq(studioSessions.title, row.title)).limit(1);
    if (existing) {
      console.log(`exists: ${row.title}`);
      continue;
    }
    const [made] = await db.insert(studioSessions).values(row).returning({ publicId: studioSessions.publicId });
    console.log(`created: ${row.title}`);
    if (row.pattern && made) created.push(made.publicId);
  }

  if (created.length > 0) {
    const { studioSessionsService } = await import("@/lib/services/studio-sessions.service");
    for (const id of created) await studioSessionsService.ensureHorizon(id);
    console.log(`sessions materialised for ${created.length} classes`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
