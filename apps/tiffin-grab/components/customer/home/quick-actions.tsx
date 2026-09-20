import Link from "next/link";
import { CalendarDaysIcon, LifeBuoyIcon, PlusIcon, UtensilsIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";

const ACTIONS = [
  { href: "/me/deliveries", label: "Deliveries", icon: CalendarDaysIcon },
  { href: "/me/meals", label: "Meals", icon: UtensilsIcon },
  { href: "/me/support", label: "Support", icon: LifeBuoyIcon },
  { href: "/subscribe", label: "Order", icon: PlusIcon },
] as const;

export function QuickActions() {
  return (
    <nav aria-label="Quick actions" className="grid grid-cols-4 gap-2.5 lg:grid-cols-2">
      {ACTIONS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="bg-card hover:border-primary/50 flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-sm font-medium transition-[transform,border-color] duration-150 active:scale-[0.96] motion-reduce:active:scale-100 lg:min-h-24"
        >
          <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-full">
            <Icon className="size-[18px]" aria-hidden />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function QuickActionsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-2.5 lg:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[5.25rem] rounded-2xl lg:h-24" />
      ))}
    </div>
  );
}
