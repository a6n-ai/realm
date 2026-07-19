// Plain module (no "use client") so both the server page and the client section
// components can import the shared order/labels without crossing the RSC value
// boundary. Order: week strip · subscription · finances.

export type HomeSectionKey = "week" | "subscription" | "wallet";

export const HOME_SECTIONS: readonly { key: HomeSectionKey; title: string }[] = [
  { key: "week", title: "This week" },
  { key: "subscription", title: "Your subscription" },
  { key: "wallet", title: "Finances" },
];
