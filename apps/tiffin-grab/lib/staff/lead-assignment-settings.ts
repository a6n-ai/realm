import type { LeadAssignmentConfig, Strategy } from "./assignment";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

const ASSIGNMENT_DEFAULT: LeadAssignmentConfig = { strategy: "round_robin", perSource: {}, cursor: {} };

// "creator" is legacy: staff creators always own their records now, so for everything else it means round robin.
const noCreator = (s: Strategy | undefined): Strategy | undefined => (s === "creator" ? "round_robin" : s);
function normalizeAssignment(c: LeadAssignmentConfig): LeadAssignmentConfig {
  return {
    ...c,
    strategy: noCreator(c.strategy) ?? "round_robin",
    perSource: Object.fromEntries(Object.entries(c.perSource ?? {}).map(([k, v]) => [k, noCreator(v) ?? "round_robin"])),
    ...(c.orders ? { orders: { ...c.orders, strategy: noCreator(c.orders.strategy) ?? "round_robin" } } : {}),
    ...(c.tickets ? { tickets: { ...c.tickets, strategy: noCreator(c.tickets.strategy) ?? "round_robin" } } : {}),
  };
}

export async function getLeadAssignment(): Promise<LeadAssignmentConfig> {
  return settingsCache.getOrSet("assignment", async () => {
    const [row] = await db.select({ la: app.leadAssignment }).from(app).limit(1);
    return normalizeAssignment({ ...ASSIGNMENT_DEFAULT, ...((row?.la as Partial<LeadAssignmentConfig>) ?? {}) });
  });
}

export async function setLeadAssignment(cfg: LeadAssignmentConfig): Promise<void> {
  await saveSetting({ leadAssignment: cfg });
}
