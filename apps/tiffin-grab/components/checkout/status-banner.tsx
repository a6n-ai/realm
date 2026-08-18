import type { ReactNode } from "react";

const TONES = {
  success: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400" },
  warning: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400" },
} as const;

export function toneClasses(tone: keyof typeof TONES) {
  return TONES[tone];
}

/** Inline success/warning callout for checkout — centralizes the emerald/amber
 * classes that were previously copy-pasted at each call site. */
export function StatusBanner({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof TONES;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const { bg, text } = TONES[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${bg} ${text}`}>
      {icon}
      <span>{children}</span>
    </div>
  );
}
