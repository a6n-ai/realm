export function TrialPill({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-950 uppercase dark:bg-amber-900/40 dark:text-amber-100 ${className}`}>
      Trial
    </span>
  );
}
