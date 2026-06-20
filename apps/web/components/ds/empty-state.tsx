import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon, message, action,
}: {
  icon: LucideIcon;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-3 px-5 py-12 text-center">
      <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-xl">
        <Icon className="size-6" />
      </span>
      <p className="text-muted-foreground max-w-sm">{message}</p>
      {action}
    </div>
  );
}
