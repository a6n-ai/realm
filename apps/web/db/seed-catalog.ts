import { db } from "./client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans } from "./schema";

const PLANS = [
  { key: "veg", name: "Pure Vegetarian Plan", description: "Seasonal vegetables, paneer, daal, rotis, raitas." },
  { key: "halal_nonveg", name: "Halal Non-Veg Plan", description: "Poultry, mutton, egg masalas, daals, chapatis." },
  { key: "mixed", name: "Veg & Non-Veg Mixed Plan", description: "Alternating vegetarian and non-vegetarian days." },
];

const MEAL_SIZES = [
  { key: "small_thali", name: "Small Thali", tier: "budget", diet: "veg", components: ["12oz Sabzi", "12oz Rice", "2 Rotis"], kcalMin: 550, kcalMax: 650, proteinG: 18, carbsG: 90, fatG: 16, basePrice: "9.99" },
  { key: "sabzi_only", name: "Sabzi Only", tier: "budget", diet: "veg", components: ["2x 8oz Sabzi", "8oz Daal"], kcalMin: 400, kcalMax: 550, proteinG: 20, carbsG: 45, fatG: 18, basePrice: "8.49" },
  { key: "four_item_regular", name: "4-Item Thali (Regular)", tier: "medium", diet: "both", components: ["8oz Sabzi", "8oz Daal", "12oz Rice", "2 Rotis"], kcalMin: 750, kcalMax: 850, proteinG: 28, carbsG: 110, fatG: 22, basePrice: "11.99" },
  { key: "four_item_large", name: "4-Item Thali (Large)", tier: "medium", diet: "both", components: ["12oz Sabzi", "12oz Daal", "12oz Rice", "4 Rotis"], kcalMin: 950, kcalMax: 1100, proteinG: 36, carbsG: 140, fatG: 28, basePrice: "13.99" },
  { key: "five_item_regular", name: "5-Item Thali (Regular)", tier: "medium", diet: "both", components: ["8oz Sabzi", "8oz Daal", "12oz Rice", "3 Rotis", "8oz Raita/Salad"], kcalMin: 850, kcalMax: 1000, proteinG: 32, carbsG: 125, fatG: 26, basePrice: "13.49" },
  { key: "new_thali", name: "New Thali", tier: "medium", diet: "both", components: ["8oz Sabzi", "8oz Daal", "8 Rotis"], kcalMin: 900, kcalMax: 1100, proteinG: 34, carbsG: 130, fatG: 24, basePrice: "12.49" },
  { key: "five_item_large", name: "5-Item Thali (Large)", tier: "premium", diet: "both", components: ["12oz Sabzi", "12oz Daal", "12oz Rice", "6 Rotis", "Salad", "Raita"], kcalMin: 1200, kcalMax: 1450, proteinG: 44, carbsG: 165, fatG: 34, basePrice: "16.99" },
  { key: "maharaja_thali", name: "Maharaja Thali", tier: "premium", diet: "both", components: ["12oz Sabzi", "12oz Daal", "8oz Sabzi", "12oz Rice", "8 Rotis", "Salad", "Raita"], kcalMin: 1500, kcalMax: 1750, proteinG: 52, carbsG: 190, fatG: 40, basePrice: "19.99" },
] as const;

const ADDONS = [
  { key: "saturday", name: "Saturday Special (Biryanis & Pulaos)", pricePerWeek: "15.00" },
  { key: "sunday", name: "Sunday Classics (Curries & Parathas)", pricePerWeek: "15.00" },
];

const FREQUENCIES = [
  { key: "5_day", name: "5 Days/Wk (Mon–Fri)", daysPerWeek: 5, courierDiscountPct: 0 },
  { key: "mwf", name: "3 Days/Wk Alternate (MWF)", daysPerWeek: 3, courierDiscountPct: 10 },
];

const DURATIONS = [
  { weeks: 1, discountPct: 0 },
  { weeks: 2, discountPct: 2 },
  { weeks: 4, discountPct: 5 },
  { weeks: 8, discountPct: 10 },
  { weeks: 12, discountPct: 15 },
];

const ZONES = [
  { name: "Etobicoke", postalPrefixes: ["M8", "M9"], slotWindow: "9:00 AM – 12:00 PM" },
  { name: "Mississauga", postalPrefixes: ["L5"], slotWindow: "10:00 AM – 1:00 PM" },
  { name: "Brampton", postalPrefixes: ["L6P", "L6R", "L6S", "L6T", "L6V", "L6W", "L6X", "L6Y", "L6Z", "L7A"], slotWindow: "11:00 AM – 2:00 PM" },
  { name: "Toronto", postalPrefixes: ["M4", "M5", "M6"], slotWindow: "10:00 AM – 1:00 PM" },
  { name: "Scarborough", postalPrefixes: ["M1"], slotWindow: "12:00 PM – 3:00 PM" },
  { name: "Markham", postalPrefixes: ["L3R", "L3S", "L3P", "L6B", "L6C", "L6E", "L6G"], slotWindow: "11:00 AM – 2:00 PM" },
  { name: "Richmond Hill", postalPrefixes: ["L4B", "L4C", "L4E", "L4S"], slotWindow: "11:00 AM – 2:00 PM" },
  { name: "North York", postalPrefixes: ["M2", "M3"], slotWindow: "10:00 AM – 1:00 PM" },
  { name: "Vaughan", postalPrefixes: ["L4H", "L4J", "L4K", "L4L", "L6A"], slotWindow: "11:00 AM – 2:00 PM" },
  { name: "Oakville", postalPrefixes: ["L6H", "L6J", "L6K", "L6L", "L6M"], slotWindow: "12:00 PM – 3:00 PM" },
  { name: "East York", postalPrefixes: ["M4B", "M4C", "M4G", "M4H", "M4J", "M4K"], slotWindow: "10:00 AM – 1:00 PM" },
];

async function main() {
  for (const p of PLANS) await db.insert(plans).values(p).onConflictDoNothing({ target: plans.key });
  for (const m of MEAL_SIZES) await db.insert(mealSizes).values(m).onConflictDoNothing({ target: mealSizes.key });
  for (const a of ADDONS) await db.insert(addons).values(a).onConflictDoNothing({ target: addons.key });
  for (const f of FREQUENCIES) await db.insert(deliveryFrequencies).values(f).onConflictDoNothing({ target: deliveryFrequencies.key });
  for (const d of DURATIONS) await db.insert(durationPackages).values(d).onConflictDoNothing({ target: durationPackages.weeks });
  for (const z of ZONES) await db.insert(deliveryZones).values(z).onConflictDoNothing({ target: deliveryZones.name });
  console.log(`Seeded catalog: ${PLANS.length} plans, ${MEAL_SIZES.length} meal sizes, ${ADDONS.length} addons, ${FREQUENCIES.length} frequencies, ${DURATIONS.length} durations, ${ZONES.length} zones`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
