import { inArray } from "drizzle-orm";
import { orders } from "@/db/schema";
import type { OrderStatus } from "./status";

export const orderStatusIn = (list: readonly OrderStatus[]) => inArray(orders.status, [...list]);
