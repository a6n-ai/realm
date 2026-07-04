import type { ReactNode } from "react";

export function Section({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-4 py-16 ${className}`}>
      {children}
    </section>
  );
}
