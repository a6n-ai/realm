// Data-free so the Customers loading skeleton can import these without pulling in the DB-backed service.
export type CustomerSortColumn = "name" | "email" | "phone" | "paid" | "free" | "cancelled" | "latestOrder" | "lastDelivered";
export const CUSTOMER_SORT_KEYS: readonly CustomerSortColumn[] = ["name", "email", "phone", "paid", "free", "cancelled", "latestOrder", "lastDelivered"];

/** What the page's date range filters on. `joined` (the default) is the account's creation date. */
export const CUSTOMER_DATE_BY = [
  { value: "joined", label: "Customer joined" },
  { value: "ordered", label: "Order date" },
] as const;
export type CustomerDateBy = (typeof CUSTOMER_DATE_BY)[number]["value"];
