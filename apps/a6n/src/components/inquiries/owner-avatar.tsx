import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { initials } from "@foundry/ui/initials";
import { UserRoundIcon } from "lucide-react";

export function OwnerAvatar({ name }: { name: string | null }) {
  return (
    <Avatar size="sm" title={name ?? "Unassigned"}>
      <AvatarFallback className={name ? "font-medium" : "border border-dashed bg-transparent"}>{name ? initials(name) : <UserRoundIcon aria-hidden className="size-3" />}</AvatarFallback>
    </Avatar>
  );
}
