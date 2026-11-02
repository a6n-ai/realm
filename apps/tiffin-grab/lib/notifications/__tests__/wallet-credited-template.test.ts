import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTemplate } from "@/db/schema";
import { seedWalletCreditedTemplates } from "../wallet-credited-template";

describe("seedWalletCreditedTemplates", () => {
  it("inserts missing rows and never overwrites an existing one", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.delete(notificationTemplate).where(eq(notificationTemplate.event, "wallet_credited"));
        await seedWalletCreditedTemplates(tx);
        await tx.update(notificationTemplate).set({ subject: "edited" }).where(eq(notificationTemplate.event, "wallet_credited"));
        await seedWalletCreditedTemplates(tx);
        const rows = await tx.select().from(notificationTemplate).where(and(eq(notificationTemplate.event, "wallet_credited")));
        expect(rows.map((r) => r.channel).sort()).toEqual(["email", "in_app"]);
        expect(rows.every((r) => r.subject === "edited")).toBe(true);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
  });
});
