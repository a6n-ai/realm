// Per-day packing-label manifest for kitchen staff: one row per Tiffin-plan delivery on a
// date, with the customer's phone/name/plan and up to 7 item/qty columns matching the physical
// containers used to pack a box. Reuses resolveDeliveryMeal (the same "what a subscriber
// receives" resolver the customer calendar uses) rather than re-deriving meal picks.
import { and, eq } from "drizzle-orm";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { parseIsoDateUtc, weekdayKey } from "@realm/commons";
import { db } from "@/db/client";
import { deliveries, menuWeeks, orders, plans, users } from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { resolveDeliveryMeal } from "@/lib/menu/resolve-delivery-meal";
import { dishCategoriesService } from "./dish-categories.service";

const ITEM_SLOTS = 7;

export type PackingLabelRow = {
  deliveryPublicId: string;
  customerPhone: string;
  firstName: string;
  planName: string;
  items: { name: string; qty: number }[]; // length <= ITEM_SLOTS, in category sortOrder
};

/** National-format a stored E.164 number (e.g. "(416) 555-1234"); falls back to the raw value if it doesn't parse. */
function formatCanadianPhone(raw: string | null): string {
  if (!raw) return "";
  try {
    return parsePhoneNumberWithError(raw).formatNational();
  } catch {
    return raw;
  }
}

export async function getPackingLabels(dateIso: string): Promise<PackingLabelRow[]> {
  const rows = await db
    .select({
      deliveryPublicId: deliveries.publicId,
      orderId: orders.id,
      fullName: orders.fullName,
      persons: orders.persons,
      planId: orders.planId,
      categoryCounts: orders.categoryCounts,
      planName: plans.name,
      userPhone: users.phone,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(and(
      eq(deliveries.deliveryDate, dateIso),
      eq(deliveries.status, "scheduled"),
      eq(plans.planType, "tiffin"),
    ));
  if (rows.length === 0) return [];

  const categories = await dishCategoriesService.forPlanType("tiffin");
  const sortOrder = new Map(categories.map((c) => [c.key, c.sortOrder]));

  const weekStart = mondayOfIso(dateIso);
  // menu_weeks has no planType column — one row is shared across all plan types
  // (menu_weeks_week_unique indexes weekStart alone), so weekStart is already unique.
  const [week] = await db.select({ id: menuWeeks.id }).from(menuWeeks)
    .where(eq(menuWeeks.weekStart, weekStart))
    .limit(1);
  const dayOfWeek = weekdayKey(parseIsoDateUtc(dateIso));

  const out: PackingLabelRow[] = [];
  for (const row of rows) {
    // Sum resolved category quantities across every person on the order onto one row; dish
    // names are taken from person 1's picks (an order's persons can technically pick different
    // dishes, but a packing label needs one name per line — this is the documented assumption).
    const qtyByCategory = new Map<string, number>();
    const nameByCategory = new Map<string, string>();
    if (week) {
      for (let person = 1; person <= row.persons; person++) {
        const resolved = await resolveDeliveryMeal(
          { id: row.orderId, planId: row.planId, categoryCounts: row.categoryCounts },
          week,
          dayOfWeek,
          person,
        );
        for (const cat of resolved) {
          qtyByCategory.set(cat.category, (qtyByCategory.get(cat.category) ?? 0) + cat.quantity);
          if (!nameByCategory.has(cat.category)) {
            nameByCategory.set(cat.category, cat.picks.map((p) => p.name).join(", "));
          }
        }
      }
    }

    const items = [...qtyByCategory.entries()]
      .filter(([, qty]) => qty > 0)
      .sort(([a], [b]) => (sortOrder.get(a) ?? 0) - (sortOrder.get(b) ?? 0))
      .slice(0, ITEM_SLOTS)
      .map(([category, qty]) => ({ name: nameByCategory.get(category) ?? category, qty }));

    out.push({
      deliveryPublicId: row.deliveryPublicId,
      customerPhone: formatCanadianPhone(row.userPhone),
      firstName: (row.fullName ?? "").trim().split(/\s+/)[0] ?? "",
      planName: row.planName,
      items,
    });
  }

  return out.sort((a, b) => a.firstName.localeCompare(b.firstName));
}
