import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return <section className="mx-auto w-full max-w-6xl space-y-6">{children}</section>;
}
