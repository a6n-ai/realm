import Link from "next/link";
import { ArrowLeftIcon, XIcon } from "lucide-react";

const STEPS = ["Class", "Day", "Time", "Children", "Review"];

/** Back and close stay visible on every step; `back` is a link or, inside the wizard, a handler. */
export function BookHeader({ step, back }: { step: 1 | 2 | 3 | 4 | 5; back: string | (() => void) }) {
  const chip = "text-muted-foreground hover:text-foreground flex size-10 items-center justify-center rounded-full transition-colors";
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        {typeof back === "string" ? (
          <Link href={back} className={chip} aria-label="Back">
            <ArrowLeftIcon className="size-5" />
          </Link>
        ) : (
          <button type="button" onClick={back} className={chip} aria-label="Back">
            <ArrowLeftIcon className="size-5" />
          </button>
        )}
        <p className="text-sm font-medium">
          {STEPS[step - 1]} <span className="text-muted-foreground">· step {step} of {STEPS.length}</span>
        </p>
        <Link href="/me/classes" className={chip} aria-label="Close">
          <XIcon className="size-5" />
        </Link>
      </div>
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((label, i) => (
          <span key={label} className={`h-1 flex-1 rounded-full ${i < step ? "bg-[var(--xl-pink-600)]" : "bg-border"}`} />
        ))}
      </div>
    </header>
  );
}
