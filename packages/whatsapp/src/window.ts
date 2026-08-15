/**
 * Meta's customer-service window. A business may send free-form content only
 * within 24 hours of the customer's last inbound message; outside it, every
 * message must use a template Meta approved in advance.
 *
 * This is why campaign_content carries provider_template_id: a WhatsApp
 * campaign is almost always outside the window, so its "content" is an
 * externally-approved artifact plus variables, not copy authored in the editor.
 */
export const SERVICE_WINDOW_MS = 24 * 3_600_000;

export function isInsideServiceWindow(lastInboundAt: number | null, now: number): boolean {
  if (lastInboundAt === null) return false;
  return now - lastInboundAt < SERVICE_WINDOW_MS;
}

export function requiresTemplate(lastInboundAt: number | null, now: number): boolean {
  return !isInsideServiceWindow(lastInboundAt, now);
}
