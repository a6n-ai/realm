import { SkeletonFormCard } from "@/components/ds";

// Fills the right content column; the account layout keeps painting the page
// header + left AccountNav. Every section is a single form card.
export default function Loading() {
  return <SkeletonFormCard fields={3} />;
}
