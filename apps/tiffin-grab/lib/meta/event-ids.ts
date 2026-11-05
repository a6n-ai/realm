/** Shared Pixel + CAPI event_id so Meta can dedupe browser and server `order_submitted`. */
export function orderSubmittedEventId(paymentPublicId: string): string {
  return `order_submitted:${paymentPublicId}`;
}
