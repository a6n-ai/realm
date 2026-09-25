export type DeliveryChargeType = "none" | "fixed" | "percent";

export interface DeliveryChargeItemLike {
  id?: string;
  name: string;
  chargeType: DeliveryChargeType;
  chargeValue: number;
}

export interface DeliveryChargeCalculationResult {
  baseAmount: number;
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
 * Total = Base Charge + Delivery Type Charge + Address Tag Charge.
 * Percentage charges are computed strictly against planPrice (customer's selected plan price / tiffinSubtotal).
 */
export function calculateDeliveryCharge(params: {
  baseCharge: number;
  deliveryType?: DeliveryChargeItemLike | null;
  addressTag?: DeliveryChargeItemLike | null;
  planPrice: number;
}): DeliveryChargeCalculationResult {
  const baseAmount = round2(Math.max(0, params.baseCharge || 0));
  const planBasis = Math.max(0, params.planPrice || 0);

  let deliveryTypeInfo: DeliveryChargeCalculationResult["deliveryType"] = null;
  let deliveryTypeAmount = 0;
  if (params.deliveryType) {
    const rawVal = Math.max(0, Number(params.deliveryType.chargeValue) || 0);
    if (params.deliveryType.chargeType === "percent") {
      deliveryTypeAmount = round2(planBasis * (rawVal / 100));
    } else if (params.deliveryType.chargeType === "fixed") {
      deliveryTypeAmount = round2(rawVal);
    }
    deliveryTypeInfo = {
      id: params.deliveryType.id,
      name: params.deliveryType.name,
      chargeType: params.deliveryType.chargeType,
      chargeValue: rawVal,
      amount: deliveryTypeAmount,
    };
  }

  let addressTagInfo: DeliveryChargeCalculationResult["addressTag"] = null;
  let addressTagAmount = 0;
  if (params.addressTag) {
    const rawVal = Math.max(0, Number(params.addressTag.chargeValue) || 0);
    if (params.addressTag.chargeType === "percent") {
      addressTagAmount = round2(planBasis * (rawVal / 100));
    } else if (params.addressTag.chargeType === "fixed") {
      addressTagAmount = round2(rawVal);
    }
    addressTagInfo = {
      id: params.addressTag.id,
      name: params.addressTag.name,
      chargeType: params.addressTag.chargeType,
      chargeValue: rawVal,
      amount: addressTagAmount,
    };
  }

  const totalDeliveryCharge = round2(baseAmount + deliveryTypeAmount + addressTagAmount);

  const lines: { label: string; amount: number }[] = [];
  if (baseAmount > 0) {
    lines.push({ label: "Base delivery charge", amount: baseAmount });
  }
  if (deliveryTypeInfo && deliveryTypeAmount > 0) {
    const detail = deliveryTypeInfo.chargeType === "percent" ? ` (${deliveryTypeInfo.chargeValue}%)` : "";
    lines.push({ label: `Delivery type: ${deliveryTypeInfo.name}${detail}`, amount: deliveryTypeAmount });
  }
  if (addressTagInfo && addressTagAmount > 0) {
    const detail = addressTagInfo.chargeType === "percent" ? ` (${addressTagInfo.chargeValue}%)` : "";
    lines.push({ label: `Address tag: ${addressTagInfo.name}${detail}`, amount: addressTagAmount });
  }

  return {
    baseAmount,
    deliveryType: deliveryTypeInfo,
    addressTag: addressTagInfo,
    totalDeliveryCharge,
    lines,
  };
}
