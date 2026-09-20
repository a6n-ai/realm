"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getOptimoRouteConfig, setOptimoRouteConfig } from "@/lib/services/optimoroute/config";

export async function saveSendLoad(sendLoad: boolean) {
  await requireAdmin();
  const cfg = await getOptimoRouteConfig();
  await setOptimoRouteConfig({ ...cfg, sendLoad });
  revalidatePath("/dashboard/settings/optimoroute");
}
