import { SkeletonFormCard } from "@/components/ds";

// Fills the content slot below the wallet sub-tabs (the wallet layout keeps
// painting the page header + WalletTabs). Sub-pages are config forms/tables;
// a single card placeholder covers them generically.
export default function Loading() {
  return <SkeletonFormCard fields={3} />;
}
