import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { bookings } from "@/db/schema";

export type BookingRow = typeof bookings.$inferSelect;

export class BookingsRepository extends UpdatableRepository<typeof bookings> {}

export const bookingsRepository = new BookingsRepository(db, bookings, bookings.publicId, bookings.id);
