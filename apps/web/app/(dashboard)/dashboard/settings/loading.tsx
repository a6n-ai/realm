import { SkeletonFormCard } from "@/components/ds";

// Fills the content slot below the settings tabs; the layout keeps painting the
// page header + SettingsTabs. Sections are config forms (and one or two tables);
// a single form card is the common-case placeholder.
export default function Loading() {
  return <SkeletonFormCard fields={4} />;
}
