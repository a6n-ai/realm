// Look-only: Edit meal options (new code) for the custom-meal customers' Oct 7 deliveries. Reopens the
// cutoff only for the read and always restores it.
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";
import { listValidSwapOptionsForDelivery } from "@/lib/services/swap-options.service";
const IDS: Record<string, string> = { Deepak: "dlv_E3aTZ3wsD_D2", Kartik: "dlv_ANwRQGAw6Pzc", Prabhgun: "dlv_AOyVRed1c7gz", Kritika: "dlv_YlYuG_KDyM8_", Vikram: "dlv_xRec30CS0WXU", Shruthi: "dlv_mMk6nRxdQiL3", Ramsha: "dlv_swPpgsWwVAB1" };
async function main() {
  for (const [name, pid] of Object.entries(IDS)) {
    const [d] = await db.select().from(deliveries).where(eq(deliveries.publicId, pid));
    const orig = d!.cutoffAt;
    try {
      await db.update(deliveries).set({ cutoffAt: Date.now() + 7_200_000 }).where(eq(deliveries.id, d!.id));
      const opts = (await listValidSwapOptionsForDelivery(pid)) as unknown as { fromCategory: string; toCategory: string; available: boolean; reason: string | null; validBundles: { fromPicks: number; giveNatural: string; getNatural: string }[] }[];
      console.log("OUT ==", name, opts.length ? "" : "(no options)");
      for (const x of opts) console.log("OUT    ", `${x.fromCategory}->${x.toCategory}`, x.available ? "" : `UNAVAILABLE ${x.reason}`, x.validBundles.map((b) => `${b.fromPicks}: ${b.giveNatural} -> ${b.getNatural}`).join(" ; "));
    } catch (e) { console.log("OUT ==", name, "ERROR", (e as Error).message); }
    finally { await db.update(deliveries).set({ cutoffAt: orig }).where(eq(deliveries.id, d!.id)); }
  }
  process.exit(0);
}
main();
