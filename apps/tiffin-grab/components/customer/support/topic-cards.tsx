import Link from "next/link";
import { CalendarDays, CreditCard, MessageCircleHeart, Package, Truck, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import type { TicketCategoryValue } from "@/lib/support/ticket-taxonomy";

const TOPICS: { category: TicketCategoryValue; title: string; icon: LucideIcon }[] = [
  { category: "delivery", title: "Delivery", icon: Truck },
  { category: "food_meal", title: "Food", icon: UtensilsCrossed },
  { category: "plan_subscription", title: "Plan", icon: CalendarDays },
  { category: "billing", title: "Billing", icon: CreditCard },
  { category: "packaging", title: "Packaging", icon: Package },
  { category: "feedback", title: "Feedback", icon: MessageCircleHeart },
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
              className={cn(FOCUS, "flex h-full min-h-14 items-center gap-3 rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-transform [touch-action:manipulation] active:scale-[.98] motion-reduce:active:scale-100")}
            >
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--primary-wash,#FBE3D2)] text-[var(--primary)]">
                <t.icon className="size-5" />
              </span>
              <span className="min-w-0 truncate text-[15px] font-semibold">{t.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
