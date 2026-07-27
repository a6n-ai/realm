/**
 * Clover inventory SoT (Uber-only → OOS, missing-on-Clover → OOS) only applies
 * after a merchant is OAuth-connected — not merely because the plugin is installed.
 */
export function isCloverInventoryConnected(clover: {
  connected: boolean;
  merchantId?: string | null;
}): boolean {
  return Boolean(clover.connected && clover.merchantId);
}

/**
 * Effective availability for catalog/admin display.
 * When Clover is not connected, Uber-only rows forced inactive for Clover linking
 * are treated as available (Clover SoT OOS rules do not apply yet).
 */
export function isEffectivelyAvailable(
  product: {
    active: boolean;
    source: string;
    cloverItemId?: string | null;
  },
  cloverConnected: boolean,
): boolean {
  if (product.active) return true;
  if (!cloverConnected && product.source === "uber_eats" && !product.cloverItemId) {
    return true;
  }
  return false;
}
