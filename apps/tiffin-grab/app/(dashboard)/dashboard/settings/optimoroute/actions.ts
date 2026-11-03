"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { updateOptimoRouteConfig } from "@/lib/services/optimoroute/config";

export async function saveSendLoad(sendLoad: boolean) {
  await requireAdmin();
  await updateOptimoRouteConfig({ sendLoad });
  revalidatePath("/dashboard/settings/optimoroute");
}
