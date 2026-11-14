"use server";
import { staffAction } from "@/lib/actions/staff-action";
import type { ActionResult } from "@/lib/actions/action-result";
import { updateOptimoRouteConfig } from "@/lib/optimoroute/config";

export async function saveSendLoad(sendLoad: boolean): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/settings/optimoroute"] }, async () => {
    await updateOptimoRouteConfig({ sendLoad });
  });
}
