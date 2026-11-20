import { Button } from "@foundry/ui/button";
import { PlusIcon } from "lucide-react";

export function NewGroupButtonSkeleton() {
  return (
    <Button disabled>
      <PlusIcon /> New group
    </Button>
  );
}
