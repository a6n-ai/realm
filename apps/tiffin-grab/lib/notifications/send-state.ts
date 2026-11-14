/** One outbox row's delivery state; opened/delivered come from SES events. */
export type SendState = { status: string; at: number; deliveredAt: number | null; openedAt: number | null };
