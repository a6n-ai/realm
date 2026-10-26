import { CalendarDays, CreditCard, MessageCircle, MessageCircleHeart, Package, Truck, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { IconTint } from "@/components/customer/kit";
import type { TicketCategoryValue } from "@/lib/support/ticket-taxonomy";

/** Support topics with their Settings-style icon colour, shared by the topic grid and the chat rows. */
export const TOPICS: { category: TicketCategoryValue; title: string; icon: LucideIcon; tint: IconTint }[] = [
  { category: "delivery", title: "Delivery", icon: Truck, tint: "orange" },
  { category: "food_meal", title: "Food", icon: UtensilsCrossed, tint: "red" },
  { category: "plan_subscription", title: "Plan", icon: CalendarDays, tint: "blue" },
  { category: "billing", title: "Billing", icon: CreditCard, tint: "indigo" },
  { category: "packaging", title: "Packaging", icon: Package, tint: "brown" },
  { category: "feedback", title: "Feedback", icon: MessageCircleHeart, tint: "pink" },
];

/** A chat's topic look; categories outside the grid fall back to a gray chat bubble. */
export function topicFor(category: string): { icon: LucideIcon; tint: IconTint } {
  return TOPICS.find((t) => t.category === category) ?? { icon: MessageCircle, tint: "gray" };
}
