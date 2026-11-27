import type { ReactNode } from "react";

// One large framed panel for a list or its empty state; ResourceTable drops its own inset inside it.
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div data-slot="card-content" className="mx-4 mb-4 overflow-hidden rounded-xl border bg-card">
      {children}
    </div>
  );
}
