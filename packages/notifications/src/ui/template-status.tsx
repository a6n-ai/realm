/** "order_activated" → "Order activated" for human-readable labels. */
export function eventLabel(event: string | null): string {
  // Campaign rows carry no event; the outbox row is identified by its campaign.
  if (!event) return "Campaign";
  return event.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
