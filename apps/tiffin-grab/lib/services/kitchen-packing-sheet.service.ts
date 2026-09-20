// Daily Kitchen Packing Sheet: one delivery = one row; dish columns are discovered from
// that day's resolved orders (never hard-coded). Reuses resolveDeliveryMeal + portion
// mapping so the sheet matches what the customer calendar shows.
import { and, asc, eq, inArray } from "drizzle-orm";
import { parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { db } from "@/db/client";
import {
  deliveries,
  deliveryCategorySwaps,
  dishCategories,
  mealSizeItems,
  orders,
  plans,
} from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import {
  addDishPortion,
  formatDishCell,
  type PortionQty,
} from "@/lib/menu/packing-requirement";
import { portionForPick, portionsByCategory } from "@/lib/menu/pick-size";
import { resolveDeliveryMeal } from "@/lib/menu/resolve-delivery-meal";
import { menuService } from "@/lib/services/menu.service";

export type KitchenPackingRow = {
  deliveryPublicId: string;
  deliveryDate: string;
  customerName: string;
  orderId: string;
  /** dish name → kitchen cell text ("12 OZ × 1") or "—" */
  cells: Record<string, string>;
};

export type KitchenSummaryLine = {
  dish: string;
  portion: string;
  totalQuantity: number;
};

export type KitchenPackingSheet = {
  dateIso: string;
  /** Unique dish names present on this day's orders — Excel column headers. */
  dishColumns: string[];
  rows: KitchenPackingRow[];
  summary: KitchenSummaryLine[];
};

export async function getKitchenPackingSheet(dateIso: string): Promise<KitchenPackingSheet> {
  const deliveryRows = await db
    .select({
      deliveryId: deliveries.id,
      deliveryPublicId: deliveries.publicId,
      orderId: orders.id,
      deploymentId: orders.deploymentId,
      fullName: orders.fullName,
      persons: orders.persons,
      planId: orders.planId,
      mealSizeId: orders.mealSizeId,
      categoryCounts: orders.categoryCounts,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(
      and(
        eq(deliveries.deliveryDate, dateIso),
        eq(deliveries.status, "scheduled"),
        eq(plans.planType, "tiffin"),
      ),
    )
    .orderBy(asc(deliveries.id));

  if (deliveryRows.length === 0) {
    return { dateIso, dishColumns: [], rows: [], summary: [] };
  }

  const weekStart = mondayOfIso(dateIso);
  // Exact released week only — same gate as customer calendar / daily labels.
  const week = await menuService.getReleasedWeek(weekStart);
  const dayOfWeek = weekdayKey(parseIsoDateUtc(dateIso));

  const [sizeItems, tuRows, swapRows] = await Promise.all([
    db
      .select({
        mealSizeId: mealSizeItems.mealSizeId,
        category: mealSizeItems.category,
        tuAmount: mealSizeItems.tuAmount,
        sortOrder: mealSizeItems.sortOrder,
      })
      .from(mealSizeItems)
      .where(inArray(mealSizeItems.mealSizeId, [...new Set(deliveryRows.map((r) => r.mealSizeId))])),
    db
      .select({
        key: dishCategories.key,
        tuUnitType: dishCategories.tuUnitType,
        tuUnitSize: dishCategories.tuUnitSize,
        tuUnitLabel: dishCategories.tuUnitLabel,
      })
      .from(dishCategories),
    db
      .select({
        deliveryId: deliveryCategorySwaps.deliveryId,
        fromCategory: deliveryCategorySwaps.fromCategory,
        toCategory: deliveryCategorySwaps.toCategory,
        qtyFrom: deliveryCategorySwaps.qtyFrom,
        qtyTo: deliveryCategorySwaps.qtyTo,
      })
      .from(deliveryCategorySwaps)
      .where(inArray(deliveryCategorySwaps.deliveryId, deliveryRows.map((r) => r.deliveryId)))
      .orderBy(asc(deliveryCategorySwaps.id)),
  ]);

  const tuByKey = new Map(
    tuRows.map((c) => [
      c.key,
      { tuUnitType: c.tuUnitType, tuUnitSize: Number(c.tuUnitSize), tuUnitLabel: c.tuUnitLabel },
    ]),
  );

  const dayDishTotals = new Map<string, Map<string, number>>();
  const rowAcc: {
    deliveryPublicId: string;
    customerName: string;
    orderId: string;
    byDish: Map<string, Map<string, number>>;
  }[] = [];

  for (const row of deliveryRows) {
    const byDish = new Map<string, Map<string, number>>();
    const portions = portionsByCategory(
      sizeItems.filter((i) => i.mealSizeId === row.mealSizeId),
      tuByKey,
      swapRows.filter((s) => s.deliveryId === row.deliveryId),
    );

    if (week) {
      for (let person = 1; person <= row.persons; person++) {
        const resolved = await resolveDeliveryMeal(
          {
            id: row.orderId,
            planId: row.planId,
            mealSizeId: row.mealSizeId,
            categoryCounts: row.categoryCounts,
          },
          week,
          dayOfWeek,
          person,
          row.deliveryId,
        );
        for (const cat of resolved) {
          if (cat.picks.length === 0) continue;
          // Non-selectable slots (roti/rice/…) resolve one dish name with quantity = slot
          // count; selectable slots already expand to one pick per container.
          if (!cat.selectable) {
            const pick = cat.picks[0]!;
            for (let i = 1; i <= cat.quantity; i++) {
              addDishPortion(byDish, pick.name, portionForPick(portions, cat.category, i), 1);
              addDishPortion(dayDishTotals, pick.name, portionForPick(portions, cat.category, i), 1);
            }
          } else {
            cat.picks.forEach((pick, i) => {
              const portion = portionForPick(portions, cat.category, i + 1);
              addDishPortion(byDish, pick.name, portion, 1);
              addDishPortion(dayDishTotals, pick.name, portion, 1);
            });
          }
        }
      }
    }

    rowAcc.push({
      deliveryPublicId: row.deliveryPublicId,
      customerName: (row.fullName ?? "").trim() || "Customer",
      orderId: row.deploymentId,
      byDish,
    });
  }

  const dishColumns = [...dayDishTotals.keys()].sort((a, b) => a.localeCompare(b));

  const rows: KitchenPackingRow[] = rowAcc
    .map((r) => {
      const cells: Record<string, string> = {};
      for (const dish of dishColumns) {
        const byPortion = r.byDish.get(dish);
        const portions: PortionQty[] = byPortion
          ? [...byPortion.entries()].map(([portion, quantity]) => ({ portion, quantity }))
          : [];
        cells[dish] = formatDishCell(portions);
      }
      return {
        deliveryPublicId: r.deliveryPublicId,
        deliveryDate: dateIso,
        customerName: r.customerName,
        orderId: r.orderId,
        cells,
      };
    })
    .sort((a, b) => a.customerName.localeCompare(b.customerName));

  const summary: KitchenSummaryLine[] = [];
  for (const dish of dishColumns) {
    const byPortion = dayDishTotals.get(dish)!;
    for (const [portion, totalQuantity] of [...byPortion.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      summary.push({ dish, portion, totalQuantity });
    }
  }

  return { dateIso, dishColumns, rows, summary };
}
