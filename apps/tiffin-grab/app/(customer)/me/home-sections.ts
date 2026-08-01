// Plain module (no "use client") so both the server page and the client section
// components can import the shared order/labels without crossing the RSC value
// boundary. Order: week strip · subscription · orders.

export type HomeSectionKey = "week" | "subscription" | "orders";

export const HOME_SECTIONS: readonly { key: HomeSectionKey; title: string }[] = [
  { key: "week", title: "This week" },
  { key: "subscription", title: "Your subscription" },
  { key: "orders", title: "Your orders" },
];
