/** "order_activated" → "Order activated" for human-readable labels. */
export function eventLabel(event: string): string {
  return event.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
