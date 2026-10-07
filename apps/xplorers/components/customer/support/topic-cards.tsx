"use client";

import {
  CalendarDaysIcon,
  CoinsIcon,
  MessageCircleHeartIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_LABEL, type TicketCategoryValue } from "@/lib/support/ticket-taxonomy";

const TOPICS: {
  category: Exclude<TicketCategoryValue, "general">;
  hint: string;
  icon: LucideIcon;
  tone: "sky" | "blush" | "sunshine" | "mint";
}[] = [
  {
    category: "booking",
    hint: "Class seats, reschedule, attendance",
    icon: CalendarDaysIcon,
    tone: "sky",
  },
  {
    category: "billing",
    hint: "Payments, refunds, coins, coupons",
    icon: CoinsIcon,
    tone: "sunshine",
  },
  {
    category: "account_website",
    hint: "Login, username, friends, bugs",
    icon: UserRoundIcon,
    tone: "blush",
  },
  {
    category: "feedback",
    hint: "Ideas, compliments, suggestions",
    icon: MessageCircleHeartIcon,
    tone: "mint",
  },
];

export function TopicCards({ onPick }: { onPick: (category: TicketCategoryValue) => void }) {
  return (
    <section aria-labelledby="support-topics-heading" className="space-y-3">
      <div>
        <h2 id="support-topics-heading" className="text-lg font-extrabold tracking-tight">
          Or pick a topic
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Opens a new chat with that category already selected.
        </p>
      </div>
      <ul className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2">
        {TOPICS.map((t) => (
          <li key={t.category} className="h-full">
            <button
              type="button"
              onClick={() => onPick(t.category)}
              className={`xl-support-topic xl-support-topic-${t.tone}`}
            >
              <span className="xl-support-topic-icon" aria-hidden>
                <t.icon className="size-5" strokeWidth={2.25} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block font-bold tracking-tight">{CATEGORY_LABEL[t.category]}</span>
                <span className="text-muted-foreground mt-0.5 block text-sm leading-snug">{t.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
