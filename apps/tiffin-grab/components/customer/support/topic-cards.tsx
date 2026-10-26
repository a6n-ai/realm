import Link from "next/link";
import { CalendarDays, CreditCard, MessageCircleHeart, Package, Truck, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { IconTile, type IconTint } from "@/components/customer/kit";
import type { TicketCategoryValue } from "@/lib/support/ticket-taxonomy";

const TOPICS: { category: TicketCategoryValue; title: string; icon: LucideIcon; tint: IconTint }[] = [
  { category: "delivery", title: "Delivery", icon: Truck, tint: "orange" },
  { category: "food_meal", title: "Food", icon: UtensilsCrossed, tint: "red" },
  { category: "plan_subscription", title: "Plan", icon: CalendarDays, tint: "blue" },
  { category: "billing", title: "Billing", icon: CreditCard, tint: "indigo" },
  { category: "packaging", title: "Packaging", icon: Package, tint: "brown" },
  { category: "feedback", title: "Feedback", icon: MessageCircleHeart, tint: "pink" },
];

/** Big tappable topics: each opens a new ticket with that topic already picked. */
export function TopicCards() {
  return (
    <section aria-labelledby="support-topics" className={cn(FONT, "space-y-3")}>
      <h2 id="support-topics" className="text-[17px] font-semibold">Help with</h2>
      <ul className="grid grid-cols-2 gap-3">
        {TOPICS.map((t) => (
          <li key={t.category} className="h-full">
            <Link
              href={`/me/support?ticket=new&category=${t.category}`}
              scroll={false}
              className={cn(FOCUS, "flex h-full min-h-14 items-center gap-3 c-surface rounded-2xl bg-[var(--card)] px-4 py-3 transition-transform [touch-action:manipulation] active:scale-[.98] motion-reduce:active:scale-100")}
            >
              <IconTile tint={t.tint} size="lg"><t.icon /></IconTile>
              <span className="min-w-0 truncate text-[15px] font-semibold">{t.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
