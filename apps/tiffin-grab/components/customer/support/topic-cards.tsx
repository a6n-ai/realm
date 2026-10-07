import Link from "next/link";
import { CalendarDays, CreditCard, MessageCircleHeart, Package, Truck, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { CATEGORY_LABEL, type TicketCategoryValue } from "@/lib/support/ticket-taxonomy";

const TOPICS: { category: TicketCategoryValue; hint: string; icon: LucideIcon }[] = [
  { category: "delivery", hint: "Late, missing or wrong address", icon: Truck },
  { category: "food_meal", hint: "Taste, quantity, wrong or missing item", icon: UtensilsCrossed },
  { category: "plan_subscription", hint: "Pause, skip, change or renew", icon: CalendarDays },
  { category: "billing", hint: "Payments, refunds, charges", icon: CreditCard },
  { category: "packaging", hint: "Leaks, damage, containers", icon: Package },
  { category: "feedback", hint: "Ideas and compliments", icon: MessageCircleHeart },
];

/** Big tappable topics: each opens a new ticket with that topic already picked. */
export function TopicCards() {
  return (
    <section aria-labelledby="support-topics" className={cn(FONT, "space-y-3")}>
      <h2 id="support-topics" className="text-[17px] font-semibold">What do you need help with?</h2>
      <ul className="grid grid-cols-2 gap-3">
        {TOPICS.map((t) => (
          <li key={t.category} className="h-full">
            <Link
              href={`/me/support?ticket=new&category=${t.category}`}
              scroll={false}
              className={cn(FOCUS, "flex h-full min-h-16 flex-col items-start gap-2 rounded-2xl sm:flex-row sm:items-center sm:gap-3 border-[1.5px] border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-transform [touch-action:manipulation] active:scale-[.98] motion-reduce:active:scale-100")}
            >
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--primary-wash,#FBE3D2)] text-[var(--primary)]">
                <t.icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{CATEGORY_LABEL[t.category]}</span>
                <span className="block text-[13px] text-[var(--muted-foreground,#6E6558)]">{t.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
