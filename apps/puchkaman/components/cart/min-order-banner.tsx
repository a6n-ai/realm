import { money } from "@/lib/cart/types";

/**
 * Progress toward the admin-set order minimum. Renders nothing once the
 * minimum is unset (0) or already met — callers gate their own "met" state
 * off `subtotal >= minOrderValue` for the checkmark/enable logic; this is
 * only the nudge shown while short.
 */
export function MinOrderBanner({
  subtotal,
  minOrderValue,
  className,
}: {
  subtotal: number;
  minOrderValue: number;
  className?: string;
}) {
  if (minOrderValue <= 0 || subtotal >= minOrderValue) return null;
  const pct = Math.max(4, Math.min(100, (subtotal / minOrderValue) * 100));

  return (
    <div className={`min-order-banner ${className ?? ""}`} role="status">
      <p className="min-order-banner__label">
        Add <strong>{money(minOrderValue - subtotal)}</strong> more to reach the {money(minOrderValue)}{" "}
        order minimum
      </p>
      <div className="min-order-banner__track" aria-hidden="true">
        <div className="min-order-banner__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
