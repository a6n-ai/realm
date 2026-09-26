export type DeliveryChargeType = "none" | "fixed" | "percent";

export interface DeliveryChargeItemLike {
  id?: string;
  name: string;
  chargeType: DeliveryChargeType;
  chargeValue: number;
}

export interface DeliveryOptionItemLike extends DeliveryChargeItemLike {
  tagId?: string | null;
  tagName?: string | null;
}

export interface DeliveryTagItemLike extends DeliveryChargeItemLike {}

export interface DeliveryChargeCalculationResult {
  baseAmount: number;
  deliveryOption?: {
    id?: string;
    tagId?: string | null;
    tagName?: string | null;
    name: string;
    chargeType: DeliveryChargeType;
    chargeValue: number;
    amount: number;
  } | null;
  deliveryTag?: {
    id?: string;
    name: string;
    chargeType: DeliveryChargeType;
    chargeValue: number;
    amount: number;
  } | null;
  // Backward-compatible aliases
  deliveryType?: {
    id?: string;
    name: string;
    chargeType: DeliveryChargeType;
    chargeValue: number;
    amount: number;
  } | null;
  addressTag?: {
    id?: string;
    name: string;
    chargeType: DeliveryChargeType;
    chargeValue: number;
    amount: number;
  } | null;
  totalDeliveryCharge: number;
  lines: { label: string; amount: number }[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Pure calculation function for delivery charges.
 * Total = Base Charge + Delivery Option Charge + Delivery Tag Charge.
 * Percentage charges are computed strictly against planPrice (customer's selected plan price / tiffinSubtotal).
 */
export function calculateDeliveryCharge(params: {
  baseCharge: number;
  deliveryOption?: DeliveryOptionItemLike | null;
  deliveryTag?: DeliveryTagItemLike | null;
  deliveryType?: DeliveryChargeItemLike | null;
  addressTag?: DeliveryChargeItemLike | null;
  planPrice: number;
}): DeliveryChargeCalculationResult {
  const baseAmount = round2(Math.max(0, params.baseCharge || 0));
  const planBasis = Math.max(0, params.planPrice || 0);

  const opt = params.deliveryOption ?? params.deliveryType;
  let deliveryOptionInfo: DeliveryChargeCalculationResult["deliveryOption"] = null;
  let deliveryOptionAmount = 0;
  if (opt) {
    const rawVal = Math.max(0, Number(opt.chargeValue) || 0);
    if (opt.chargeType === "percent") {
      deliveryOptionAmount = round2(planBasis * (rawVal / 100));
    } else if (opt.chargeType === "fixed") {
      deliveryOptionAmount = round2(rawVal);
    }
    deliveryOptionInfo = {
      id: opt.id,
      tagId: (opt as DeliveryOptionItemLike).tagId ?? null,
      tagName: (opt as DeliveryOptionItemLike).tagName ?? null,
      name: opt.name,
      chargeType: opt.chargeType,
      chargeValue: rawVal,
      amount: deliveryOptionAmount,
    };
  }

  const tag = params.deliveryTag ?? params.addressTag;
  let deliveryTagInfo: DeliveryChargeCalculationResult["deliveryTag"] = null;
  let deliveryTagAmount = 0;
  if (tag) {
    const rawVal = Math.max(0, Number(tag.chargeValue) || 0);
    if (tag.chargeType === "percent") {
      deliveryTagAmount = round2(planBasis * (rawVal / 100));
    } else if (tag.chargeType === "fixed") {
      deliveryTagAmount = round2(rawVal);
    }
    deliveryTagInfo = {
      id: tag.id,
      name: tag.name,
      chargeType: tag.chargeType,
      chargeValue: rawVal,
      amount: deliveryTagAmount,
    };
  }

  const totalDeliveryCharge = round2(baseAmount + deliveryOptionAmount + deliveryTagAmount);

  const lines: { label: string; amount: number }[] = [];
  if (baseAmount > 0) {
    lines.push({ label: "Base delivery charge", amount: baseAmount });
  }
  if (deliveryTagInfo && deliveryTagAmount > 0) {
    lines.push({
      label: `${deliveryTagInfo.name} (${deliveryTagInfo.chargeType === "percent" ? `${deliveryTagInfo.chargeValue}%` : `$${deliveryTagAmount.toFixed(2)}`})`,
      amount: deliveryTagAmount,
    });
  }
  if (deliveryOptionInfo && deliveryOptionAmount > 0) {
    lines.push({
      label: `${deliveryOptionInfo.name} (${deliveryOptionInfo.chargeType === "percent" ? `${deliveryOptionInfo.chargeValue}%` : `$${deliveryOptionAmount.toFixed(2)}`})`,
      amount: deliveryOptionAmount,
    });
  }

  return {
    baseAmount,
    deliveryOption: deliveryOptionInfo,
    deliveryTag: deliveryTagInfo,
    deliveryType: deliveryOptionInfo,
    addressTag: deliveryTagInfo,
    totalDeliveryCharge,
    lines,
  };
}
