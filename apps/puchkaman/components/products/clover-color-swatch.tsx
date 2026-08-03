import { cn } from "@realm/ui/cn";

/** Normalize Clover hex (#RGB / #RRGGBB / #RRGGBBAA); null if unusable. */
export function normalizeCloverColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const raw = color.trim();
  if (!raw) return null;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(withHash)) {
    return null;
  }
  return withHash.toUpperCase();
}

/**
 * Small square swatch for a Clover item color code.
 * Hidden when color is missing or not a valid hex.
 */
export function CloverColorSwatch({
  color,
  size = 14,
  className,
}: {
  color: string | null | undefined;
  /** Square edge in px (default 14). */
  size?: number;
  className?: string;
}) {
  const hex = normalizeCloverColor(color);
  if (!hex) return null;

  return (
    <span
      role="img"
      aria-label={hex}
      title={hex}
      className={cn(
        "inline-block shrink-0 rounded-[2px] border border-black/25 dark:border-white/30",
        className,
      )}
      style={{ width: size, height: size, backgroundColor: hex }}
    />
  );
}

/**
 * Swatch plus its hex, for table cells where the code itself is worth reading.
 * Renders an em dash when Clover has no colour, or the value is not usable hex —
 * a silent blank would be indistinguishable from a broken cell.
 */
export function ColorSwatch({ colorCode }: { colorCode: string | null | undefined }) {
  const hex = normalizeCloverColor(colorCode);
  if (!hex) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <CloverColorSwatch color={hex} size={16} className="rounded-sm" />
      <span className="text-muted-foreground font-mono text-xs">{hex}</span>
    </span>
  );
}
