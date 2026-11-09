import { inArray } from "drizzle-orm";
import { payments } from "@/db/schema";
import type { PaymentStatus } from "./status";

export const paymentStatusIn = (list: readonly PaymentStatus[]) => inArray(payments.status, [...list]);
