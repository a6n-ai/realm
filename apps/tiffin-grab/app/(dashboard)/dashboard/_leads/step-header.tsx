import { CheckIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";

/** Compact numbered stepper for the 2-step lead sheets (Customer → Order). */
export function StepHeader({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="border-border/70 flex items-center gap-2 border-b px-5 py-3">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold transition-colors",
                active ? "bg-primary text-primary-foreground" : done ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <CheckIcon className="size-3" /> : n}
            </span>
            <span className={cn("text-sm", active ? "text-foreground font-medium" : "text-muted-foreground")}>{label}</span>
            {n < steps.length && <span className="bg-border mx-1 h-px w-6" />}
          </div>
        );
      })}
    </div>
  );
}
