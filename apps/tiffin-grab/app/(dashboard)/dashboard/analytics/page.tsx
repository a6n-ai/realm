import { redirect } from "next/navigation";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { TAB_PERMS, firstAllowedTab } from "./tab-perms";

// Analytics index has no content of its own — the layout owns the sub-tabs.
// Land on the first sub-section the viewer can open.
export default async function AnalyticsPage() {
  await requirePagePermission({ analytics: ["read"] });
  redirect(await firstAllowedTab(TAB_PERMS, (perms) => can(perms)));
}
