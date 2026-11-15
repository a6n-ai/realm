import { Button } from "@foundry/ui/button";
import { PlusIcon } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guards";
import { MAX_REVIEW_ROWS, listOrderCities } from "@/lib/services/customer-payouts.service";
import { NewGroupDialog } from "./new-group-dialog";

export function NewGroupButtonSkeleton() {
  return (
    <Button disabled>
      <PlusIcon /> New group
    </Button>
  );
}

export async function NewGroupLauncher() {
  await requirePagePermission({ customer: ["manage"] });
  return <NewGroupDialog cities={await listOrderCities()} maxRows={MAX_REVIEW_ROWS} />;
}
