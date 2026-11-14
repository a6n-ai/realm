import { inArray, isNull } from "drizzle-orm";
import { payments } from "@/db/schema";
import type { PaymentStatus } from "./status";

export const paymentStatusIn = (list: readonly PaymentStatus[]) => inArray(payments.status, [...list]);

/** Add-on payments carry `addonRequest` and settle through the add-on path, never verifyPayment; plan payments do not. */
export const planPaymentSql = isNull(payments.addonRequest);
