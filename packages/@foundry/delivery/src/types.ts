/**
 * Types for delivery entities used across apps.
 */

export interface DeliveryOptionItemLike {
  /** Public identifier */
  publicId: string;
  /** Human readable name */
  name: string;
  /** Optional description */
  description?: string;
  /** Charge type – 'fixed' | 'percentage' | 'none' */
  chargeType: 'fixed' | 'percentage' | 'none';
  /** Charge value – meaning depends on chargeType */
  chargeValue: number;
  /** Whether the option is active */
  active: boolean;
  /** Ordering hint */
  sortOrder: number;
  /** Optional tag identifier this option belongs to */
  tagId?: string | null;
}

export interface DeliveryTagItemLike {
  publicId: string;
  name: string;
  description?: string;
  active: boolean;
  sortOrder: number;
  /** Optional list of option publicIds belonging to this tag */
  options?: DeliveryOptionItemLike[];
}

/** Result returned by calculateDeliveryCharge */
export interface DeliveryChargeCalculationResult {
  /** Canonical delivery option */
  deliveryOption: DeliveryOptionItemLike | null;
  /** Canonical delivery tag */
  deliveryTag: DeliveryTagItemLike | null;
  /** Total charge amount in cents */
  amount: number;
}
