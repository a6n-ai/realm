import Link from "next/link";
import {
  CalendarDaysIcon,
  CalendarPlusIcon,
  CoinsIcon,
  LifeBuoyIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

const ACTIONS: { href: string; label: string; hint: string; icon: LucideIcon }[] = [
  { href: "/whats-on", label: "Book a class", hint: "What's on", icon: CalendarPlusIcon },
  { href: "/me/classes", label: "My classes", hint: "Schedule", icon: CalendarDaysIcon },
  { href: "/me/wallet", label: "Finances", hint: "Coins & pay", icon: CoinsIcon },
  { href: "/me/friends", label: "Invite", hint: "Friends", icon: UsersIcon },
  { href: "/me/support", label: "Support", hint: "Get help", icon: LifeBuoyIcon },
];

export function QuickActions() {
  return (
    <nav aria-label="Quick actions">
      <ul className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0">
        {ACTIONS.map((a) => (
          <li key={a.href} className="min-w-[7.5rem] shrink-0 sm:min-w-0">
            <Link href={a.href} className="xl-quick flex h-full flex-col gap-1 px-3 py-3">
              <span className="xl-quick-icon">
                <a.icon className="size-4" aria-hidden />
              </span>
              <span className="text-sm font-bold tracking-tight">{a.label}</span>
              <span className="text-muted-foreground text-xs">{a.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
