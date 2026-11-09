import type { appEvent } from "@/db/schema";
import type { EventCategory } from "./event-categories";
import type { notificationTables } from "./tables";

export type AppEvent = (typeof appEvent.enumValues)[number];
type Channel = (typeof notificationTables.notificationOutbox.channel.enumValues)[number];

interface Field {
  name: string;
  label: string;
}
export interface EntityVars {
  entity: string;
  fields: Field[];
}

interface EventDef {
  category: EventCategory;
  /** Default channels; omitted leaves the engine default. */
  channels?: Channel[];
  /** Entity and the DB columns exposed as template variables (`{{entity.field}}`). Direct columns only. */
  vars?: EntityVars;
}

/** Everything the app knows per event; a Record so a new appEvent value without an entry fails to compile. */
export const EVENTS: Record<AppEvent, EventDef> = {
  order_created: {
    category: "orders",
    channels: ["email", "in_app"],
    vars: {
      entity: "order",
      fields: [
        { name: "code", label: "Order code" },
        { name: "customerName", label: "Customer name" },
        { name: "paymentNote", label: "Payment note (cash on delivery only)" },
      ],
    },
  },
  order_activated: {
    category: "orders",
    channels: ["email", "in_app"],
    vars: {
      entity: "order",
      fields: [
        { name: "code", label: "Order code" },
        { name: "planType", label: "Plan type" },
        { name: "total", label: "Total" },
        { name: "startDate", label: "Start date" },
        { name: "customerName", label: "Customer name" },
      ],
    },
  },
  order_completed: {
    category: "orders",
  },
  order_cancelled: {
    category: "orders",
    channels: ["email", "in_app"],
    vars: {
      entity: "order",
      fields: [
        { name: "code", label: "Order code" },
        { name: "customerName", label: "Customer name" },
      ],
    },
  },
  order_paused: {
    category: "orders",
  },
  payment_received: {
    category: "payments",
    channels: ["email", "in_app"],
    vars: {
      entity: "payment",
      fields: [
        { name: "amount", label: "Amount" },
        { name: "orderCode", label: "Order code" },
        { name: "customerName", label: "Customer name" },
        { name: "method", label: "Method" },
      ],
    },
  },
  refund_issued: {
    category: "payments",
    vars: {
      entity: "payment",
      fields: [
        { name: "amount", label: "Amount" },
        { name: "orderCode", label: "Order code" },
      ],
    },
  },
  menu_released: {
    category: "marketing",
    channels: ["email", "in_app"],
    vars: {
      entity: "menuWeek",
      fields: [
        { name: "weekStartIso", label: "Week starting" },
        { name: "cutoffLabel", label: "Cutoff" },
      ],
    },
  },
  wallet_credited: {
    category: "wallet",
    channels: ["in_app"],
    vars: {
      entity: "wallet",
      fields: [
        { name: "coins", label: "Coins" },
        { name: "reason", label: "Reason" },
      ],
    },
  },
  wallet_redeemed: {
    category: "wallet",
  },
  inquiry_created: {
    category: "inquiries",
  },
  inquiry_follow_up: {
    category: "inquiries",
    channels: ["in_app"],
    vars: {
      entity: "inquiry",
      fields: [{ name: "customerName", label: "Customer name" }],
    },
  },
  inquiry_converted: {
    category: "inquiries",
  },
  ticket_created: {
    category: "support",
  },
  ticket_reply: {
    category: "support",
    channels: ["email", "in_app"],
    vars: {
      entity: "ticket",
      fields: [
        { name: "subject", label: "Subject" },
        { name: "code", label: "Ticket code" },
      ],
    },
  },
  ticket_resolved: {
    category: "support",
  },
  signup: {
    category: "account",
  },
  manual_adjustment: {
    category: "account",
  },
  email_verification_link: {
    category: "account",
  },
  email_otp_password_reset: {
    category: "account",
  },
  email_otp_verification: {
    category: "account",
  },
  account_deletion_confirm: {
    category: "account",
  },
  password_changed: {
    category: "account",
  },
  new_login_alert: {
    category: "account",
  },
  review_nudge: {
    category: "marketing",
    channels: ["email"],
  },
  staff_invitation: {
    category: "account",
    channels: ["email"],
  },
  customer_invitation: {
    category: "account",
    channels: ["email"],
  },
  payment_reminder: {
    category: "payments",
    channels: ["email"],
    vars: {
      entity: "payment",
      fields: [
        { name: "amount", label: "Amount" },
        { name: "orderCode", label: "Order code" },
        { name: "customerName", label: "Customer name" },
        { name: "method", label: "Method" },
        { name: "instructions", label: "How to pay (by method)" },
        { name: "action", label: "Button label (by method)" },
        { name: "url", label: "Sign-in link" },
      ],
    },
  },
  payment_approved: {
    category: "payments",
    channels: ["email", "in_app"],
    vars: {
      entity: "payment",
      fields: [
        { name: "amount", label: "Amount" },
        { name: "orderCode", label: "Order code" },
        { name: "customerName", label: "Customer name" },
        { name: "method", label: "Method" },
        { name: "startDate", label: "Plan start date" },
        { name: "durationWeeks", label: "Duration (weeks)" },
        { name: "deliveryDays", label: "Delivery days" },
        { name: "eatingDays", label: "Eating days" },
        { name: "paidWith", label: "Paid with (e.g. Visa •••• 4242)" },
        { name: "cardFee", label: "Card fee (card payments with a fee)" },
        { name: "totalCharged", label: "Total charged (card payments)" },
        { name: "receiptLines", label: "Tax and fee lines" },
      ],
    },
  },
  order_complimentary: {
    category: "orders",
    channels: ["email", "in_app"],
    vars: {
      entity: "order",
      fields: [
        { name: "code", label: "Order code" },
        { name: "customerName", label: "Customer name" },
        { name: "date", label: "Delivery date" },
        { name: "reason", label: "Reason" },
      ],
    },
  },
  holiday_declared: {
    category: "account",
    channels: ["email", "in_app"],
    vars: {
      entity: "order",
      fields: [
        { name: "code", label: "Order code" },
        { name: "customerName", label: "Customer name" },
        { name: "holidayName", label: "Holiday name" },
        { name: "date", label: "Closed date" },
        { name: "movedTo", label: "Extra delivery day(s)" },
        { name: "lastDate", label: "New last delivery date" },
        { name: "outcome", label: "What changed for the customer" },
      ],
    },
  },
  holiday_removed: {
    category: "account",
    channels: ["email", "in_app"],
    vars: {
      entity: "order",
      fields: [
        { name: "code", label: "Order code" },
        { name: "customerName", label: "Customer name" },
        { name: "holidayName", label: "Holiday name" },
        { name: "date", label: "Date that is open again" },
        { name: "outcome", label: "What changed for the customer" },
      ],
    },
  },
  referral_referrer: {
    category: "account",
  },
  referral_friend: {
    category: "account",
  },
  order_renewal_reminder: {
    category: "orders",
    channels: ["email"],
    vars: {
      entity: "order",
      fields: [
        { name: "code", label: "Order code" },
        { name: "customerName", label: "Customer name" },
        { name: "mealSize", label: "Meal size" },
        { name: "lastTiffin", label: "Last tiffin date" },
        { name: "lastTiffinWhen", label: "When it ends (\"tomorrow\" or \"on Friday, Oct 30\")" },
      ],
    },
  },
  order_receipt: {
    category: "orders",
    channels: ["email"],
    vars: {
      entity: "order",
      fields: [
        { name: "code", label: "Order code" },
        { name: "customerName", label: "Customer name" },
        { name: "mealSize", label: "Meal size" },
      ],
    },
  },
};

export const NOTIFICATION_EVENTS: string[] = (Object.keys(EVENTS) as AppEvent[]).filter((e) => e !== "manual_adjustment");

/** `{{order.*}}` variables for an order email; one fallback for a missing name. */
export const orderTemplateVars = <T extends Record<string, string>>(code: string, customerName: string | null | undefined, extra: T = {} as T) => ({
  code,
  customerName: customerName || "there",
  ...extra,
});
