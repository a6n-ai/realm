import type { ReactNode } from "react";
import { Card } from "@/components/customer/kit";

/** iOS Settings group: small uppercase header, rounded body, small muted footer. `card={false}` lets the body bring its own surface (e.g. a ListGroup). */
export function SettingsBlock({ title, footer, card = true, children }: { title: string; footer?: string; card?: boolean; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{title}</h2>
      {card ? <Card className="space-y-5 p-5">{children}</Card> : children}
      {footer && <p className="px-4 text-[13px] text-[var(--muted-foreground)]">{footer}</p>}
    </section>
  );
}
