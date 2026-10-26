import type { ReactNode } from "react";
import { Card } from "./card";
import { IconTile, type IconTint } from "./icon-tile";

export type Step = { icon: ReactNode; tint: IconTint; title: string; body: string };

/** "How it works" as short steps joined by a line, like an onboarding screen, instead of a paragraph. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <Card className="p-5">
      <ol className="space-y-5">
        {steps.map((st, i) => (
          <li key={st.title} className="relative flex gap-3">
            {i < steps.length - 1 && <span aria-hidden className="absolute top-11 bottom-[-1.25rem] left-5 w-px bg-[var(--border)]" />}
            <IconTile tint={st.tint} size="lg">{st.icon}</IconTile>
            <div className="min-w-0 pt-0.5">
              <p className="text-[15px] font-semibold">{st.title}</p>
              <p className="c-caption text-pretty">{st.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
