import type { ReactNode } from "react";

// SERVER. Renders an optional muted group heading aligned to the card outer
// edge, then the group's cards stacked with space-y-5. Group-to-group rhythm
// (space-y-10) is owned by the shell that maps over the groups.
export function SectionGroup({
  heading,
  children,
}: {
  heading?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      {heading && (
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide">{heading}</h2>
      )}
      {children}
    </div>
  );
}
