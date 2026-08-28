import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { cateringInquiries } from "@/db/schema";
import type { CateringInquiry } from "@/lib/catering/schema";

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

export async function listCateringInquiries(): Promise<CateringInquiryRow[]> {
  const rows = await db.select().from(cateringInquiries).orderBy(desc(cateringInquiries.createdAt));
  return rows.map((r) => ({
    publicId: r.publicId,
    name: r.name,
    phone: r.phone,
    email: r.email,
    eventDate: r.eventDate,
    location: r.location,
    guests: r.guests,
    eventType: r.eventType,
    allergies: r.allergies,
    message: r.message,
    createdAt: r.createdAt,
  }));
}
