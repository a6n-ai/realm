// Plain module (no "use client") so both the server page and the client section
// components can import the shared order/labels without crossing the RSC value
// boundary. Order is Resolved-Decision-#2: subscription · wallet.

export type HomeSectionKey = "subscription" | "wallet";

export const HOME_SECTIONS: readonly { key: HomeSectionKey; title: string }[] = [
  { key: "subscription", title: "Your subscription" },
  { key: "wallet", title: "Wallet" },
];
