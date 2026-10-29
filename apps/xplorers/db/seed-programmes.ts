/**
 * One-off, idempotent seed: the programmes, times and prices on the live xplorers.life site (2026-10-29).
 * Skips any class whose title already exists and archives the classes the old docs/xlp.pdf catalogue created.
 * App timezone/currency/default prices are written only while app.default_prices is null (first run).
 * Then materialises sessions (ensureHorizon needs no signed-in user, so the service is called as-is).
 *
 * Run (local DB only):
 *   DATABASE_URL=postgres://localhost:5432/xplorers pnpm --filter xplorers exec tsx db/seed-programmes.ts
 */
import { and, eq, inArray } from "drizzle-orm";
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

/** One priced length: every class books as a named option so 60-minute sessions work too. */
const one = (minutes: number, price: number, adults: ClassPricing["adults"] = { free: 0, extraPrice: null }) => ({
  pricing: {
    mode: "options",
    defaultLengthMinutes: minutes,
    options: [{ key: "session", label: `${minutes} min`, lengthMinutes: minutes, adultsIncluded: adults.free }],
    extension: null,
    adults,
  } satisfies ClassPricing,
  prices: { "opt:session": same(price) } satisfies PriceTable,
});

const PRIVATE_SUMMARY =
  "One child, one caring mentor. STEAM, sensory play and life skills, guided at your child\u2019s pace and shaped around their interests, strengths and needs.";
const PRIVATE_INCLUDED =
  "S$160 for 90 minutes. Two children S$180, 10 sessions S$1,500, private groups of 4\u201310 S$68 per child: message us to arrange those. Each child makes their own project.";

/** Classes retired when the catalogue moved to the live xplorers.life programmes. Archived, never deleted. */
const RETIRED = [
  "After-School Explore & Play",
  "Think Like a Scientist",
  "Sensory Discovery, Craft & Play",
  "Bake, Cook & Discover!",
  "Make a Toy / Woodwork Club",
  "Camps for Fun",
];

// Classes that run at different times on different days are split, one class per time window.
function programmes(today: string): Seed[] {
  return [
    {
      title: "Private & Personalised Experiences",
      category: "kids",
      color: "pink",
      sortOrder: 1,
      capacity: 1,
      groupSize: "One child, one mentor",
      scheduleLine: "Mon\u2013Fri · 9am\u20138:30pm (last start 7pm)",
      summary: PRIVATE_SUMMARY,
      included: PRIVATE_INCLUDED,
      ...one(90, 160, { free: 1, extraPrice: null }),
      pattern: pattern({ weekdays: [1, 2, 3, 4, 5], startClock: "09:00", endClock: "20:30" }, today),
    },
    {
      title: "Private & Personalised · Saturday",
      category: "kids",
      color: "pink",
      sortOrder: 2,
      capacity: 1,
      groupSize: "One child, one mentor",
      scheduleLine: "Saturday · 10:30am\u201312pm",
      summary: PRIVATE_SUMMARY,
      included: PRIVATE_INCLUDED,
      ...one(90, 160, { free: 1, extraPrice: null }),
      pattern: pattern({ weekdays: [6], startClock: "10:30", endClock: "12:00" }, today),
    },
    {
      title: "Xplorers Club",
      category: "kids",
      color: "blue",
      sortOrder: 3,
      capacity: 1,
      bookingType: "enquire_only",
      scheduleLine: "1st & 3rd Wed · Online 2:30\u20133:30pm · Studio 4:30\u20136pm · Gathering 6\u20138pm",
      summary: "Big questions. Messy experiments. Wonderful discoveries. An ongoing creative learning club, online and in the studio, with a member gathering after.",
      included: "One vacancy left, membership until August 2027. Message us to ask about it.",
      pricing: none,
      pattern: pattern({ weekdays: [3], nthOfMonth: [1, 3], startClock: "16:30", endClock: "18:00" }, today),
    },
    {
      title: "Sensory Sunday",
      category: "kids",
      color: "purple",
      sortOrder: 4,
      capacity: 10,
      scheduleLine: "Sunday · 9\u201310:30am / 11am\u201312:30pm",
      summary:
        "Parent-child exploration with sensory activities, bamboo water play, cardboard crafts, sticking and gluing, messy art, simple edible creations and more.",
      included: "One parent or caregiver joins each child at no extra charge. Bring a change of clothes.",
      ...one(90, 68, { free: 1, extraPrice: null }),
      pattern: pattern({ weekdays: [7], startClock: "09:00", endClock: "12:30" }, today),
    },
    {
      title: "Slime Lab",
      category: "kids",
      color: "sky",
      sortOrder: 5,
      capacity: 6,
      scheduleLine: "Sunday · 2\u20133pm / 3:30\u20134:30pm",
      summary: "Mix, stretch and make colourful slime while discovering sensory science.",
      ...one(60, 48),
      pattern: pattern({ weekdays: [7], startClock: "14:00", endClock: "16:30" }, today),
    },
    {
      title: "Slime Lab · Saturday",
      category: "kids",
      color: "sky",
      sortOrder: 6,
      capacity: 6,
      scheduleLine: "2nd & 4th Sat · 1:30\u20132:30pm / 3\u20134pm",
      summary: "Mix, stretch and make colourful slime while discovering sensory science.",
      ...one(60, 48),
      pattern: pattern({ weekdays: [6], nthOfMonth: [2, 4], startClock: "13:30", endClock: "16:00" }, today),
    },
    {
      title: "Bake \u2022 Cook \u2022 Discover",
      category: "kids",
      color: "orange",
      sortOrder: 7,
      capacity: 6,
      scheduleLine: "1st & 3rd Sat · 2\u20134pm",
      summary: "Measure, mix, cook and bake. Discover the science behind delicious creations.",
      included: "Full ingredient sets included. An adult who joins in and makes their own is S$48.",
      ...one(120, 88, { free: 0, extraPrice: same(48) }),
      pattern: pattern({ weekdays: [6], nthOfMonth: [1, 3], startClock: "14:00", endClock: "16:00" }, today),
    },
    {
      title: "Dry Ice Magic",
      category: "kids",
      color: "blue",
      sortOrder: 8,
      capacity: 6,
      scheduleLine: "5th Sat · 1:30\u20132:30pm / 3\u20134pm",
      summary: "Fog, bubbles and science magic! Dry ice is handled by the educator.",
      ...one(60, 48),
      pattern: pattern({ weekdays: [6], nthOfMonth: [5], startClock: "13:30", endClock: "16:00" }, today),
    },
    {
      title: "Woodwork & Cardboard",
      category: "kids",
      color: "green",
      sortOrder: 9,
      capacity: 10,
      scheduleLine: "Sat & Sun · 5\u20136:30pm / 7\u20138:30pm",
      summary: "Build, design and make using cardboard and guided woodworking techniques.",
      included: "Same prices every day. Standard project materials included.",
      pricing: {
        mode: "options",
        defaultLengthMinutes: 60,
        options: [
          { key: "1h", label: "1 hour", lengthMinutes: 60, adultsIncluded: 0 },
          { key: "2h", label: "2 hours", lengthMinutes: 120, adultsIncluded: 0 },
          { key: "3h", label: "3 hours", lengthMinutes: 180, adultsIncluded: 0 },
        ],
        extension: null,
        adults: { free: 0, extraPrice: null },
      },
      prices: { "opt:1h": same(38), "opt:2h": same(68), "opt:3h": same(88) },
      pattern: pattern({ weekdays: [6, 7], startClock: "17:00", endClock: "20:30" }, today),
    },
    {
      title: "Birthday, School & Events",
      category: "kids",
      color: "yellow",
      sortOrder: 10,
      capacity: 1,
      bookingType: "enquire_only",
      scheduleLine: "Dates and timing by arrangement",
      summary: "Birthday parties, school visits and events designed around your group and theme. Custom quotation.",
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

  const retired = await db
    .update(studioSessions)
    .set({ archived: true, published: false })
    .where(and(inArray(studioSessions.title, RETIRED), eq(studioSessions.archived, false)))
    .returning({ title: studioSessions.title });
  for (const r of retired) console.log(`archived: ${r.title}`);

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
