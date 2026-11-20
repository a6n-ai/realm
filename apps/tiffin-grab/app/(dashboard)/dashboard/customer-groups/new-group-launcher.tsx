import { requirePagePermission } from "@/lib/auth/guards";
import { MAX_REVIEW_ROWS, listOrderCities } from "@/lib/services/customer-payouts.service";
import { NewGroupDialog } from "./new-group-dialog";

export async function NewGroupLauncher() {
  await requirePagePermission({ customer: ["manage"] });
  return <NewGroupDialog cities={await listOrderCities()} maxRows={MAX_REVIEW_ROWS} />;
}
