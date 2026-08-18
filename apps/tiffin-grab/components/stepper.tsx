import { Check } from "lucide-react";

/**
 * Shared step-progress indicator for the subscribe wizard and checkout —
 * both flows walked the same numbered-pill markup independently before this.
 */
export function Stepper({
  steps,
  currentIndex,
  compactLabels = false,
}: {
  steps: readonly string[];
  /** 0-based index of the active step. */
  currentIndex: number;
  /** Hide inline labels below sm and show the active step's label on its own line instead. */
  compactLabels?: boolean;
}) {
  return (
    <>
      <ol
        className={`flex items-center gap-2 text-xs font-medium [scrollbar-width:none] ${
          compactLabels ? "justify-center gap-1.5 sm:justify-start sm:gap-1 sm:overflow-x-auto" : "overflow-x-auto"
        }`}
      >
        {steps.map((label, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={label} className={`flex items-center gap-1.5 ${compactLabels ? "shrink-0" : "gap-2"}`}>
              <span
                className={`flex size-6 items-center justify-center rounded-full text-[11px] transition-colors sm:size-5 ${
                  done || current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
                aria-current={current ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}`}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={`whitespace-nowrap ${compactLabels ? "hidden sm:inline" : ""} ${
                  current ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
              {i < steps.length - 1 && (
                <span aria-hidden className={`h-px shrink-0 bg-border ${compactLabels ? "mx-0.5 w-3 sm:mx-1 sm:w-6" : "mx-1 w-6"}`} />
              )}
            </li>
          );
        })}
      </ol>
      {compactLabels && (
        <p className="text-muted-foreground text-center text-xs sm:hidden">{steps[currentIndex]}</p>
      )}
    </>
  );
}
