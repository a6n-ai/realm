import { asc, desc, sql } from "drizzle-orm";
import type { Condition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { columnResolver, conditionToSql } from "@foundry/database";
import { db } from "@/db/client";
import { cateringInquiries } from "@/db/schema";
import type { CateringInquiry } from "@/lib/catering/schema";
import type { SortState } from "@/lib/list/sort";

export async function createCateringInquiry(input: CateringInquiry): Promise<void> {
  await db.insert(cateringInquiries).values({
    name: input.name,
    phone: input.phone,
    email: input.email,
    eventDate: input.date,
    location: input.location,
    guests: input.guests,
    eventType: input.type,
    allergies: input.allergies || null,
    message: input.message || null,
  });
}

export type CateringInquiryRow = {
  publicId: string;
  name: string;
  phone: string;
  email: string;
  eventDate: string;
  location: string;
  guests: string;
  eventType: string;
  allergies: string | null;
  message: string | null;
  createdAt: number;
};

export type CateringSortColumn =
  | "submitted"
  | "name"
  | "eventDate"
  | "guests"
  // Non-sortable column keys — never reach parseSort's allowed list, kept
  // only so DataTable's Column<K> type-checks against this union.
  | "contact"
  | "location"
  | "type"
  | "notes";

export async function listCateringInquiriesPage(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<CateringSortColumn> = { column: "submitted", dir: "desc" },
): Promise<Page<CateringInquiryRow>> {
  const where = conditionToSql(
    condition,
    columnResolver({
      name: cateringInquiries.name,
      phone: cateringInquiries.phone,
      email: cateringInquiries.email,
      eventDate: cateringInquiries.eventDate,
      location: cateringInquiries.location,
      eventType: cateringInquiries.eventType,
      createdAt: cateringInquiries.createdAt,
    }),
  );

  const SORT_COL = {
    submitted: cateringInquiries.createdAt,
    name: cateringInquiries.name,
    eventDate: cateringInquiries.eventDate,
    guests: cateringInquiries.guests,
  } as const;
  const col = SORT_COL[sort.column as keyof typeof SORT_COL] ?? cateringInquiries.createdAt;

  const [items, [{ count }]] = await Promise.all([
    db
      .select()
      .from(cateringInquiries)
      .where(where)
      .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(cateringInquiries).where(where),
  ]);

  return { items, page: page.page, size: page.size, total: count };
}
