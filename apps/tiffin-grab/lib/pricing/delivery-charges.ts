export type DeliveryChargeType = "none" | "fixed" | "percent";

export interface DeliveryChargeItemLike {
  id?: string;
  name: string;
  chargeType: DeliveryChargeType;
  chargeValue: number;
}

export interface DeliveryChargeCalculationResult {
  baseAmount: number;
  deliveryStrategy?: {
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
  deliveryStrategy?: DeliveryChargeItemLike | null;
  addressTag?: DeliveryChargeItemLike | null;
  planPrice: number;
}): DeliveryChargeCalculationResult {
  const baseAmount = round2(Math.max(0, params.baseCharge || 0));
  const planBasis = Math.max(0, params.planPrice || 0);

  let deliveryStrategyInfo: DeliveryChargeCalculationResult["deliveryStrategy"] = null;
  let deliveryStrategyAmount = 0;
  if (params.deliveryStrategy) {
    const rawVal = Math.max(0, Number(params.deliveryStrategy.chargeValue) || 0);
    if (params.deliveryStrategy.chargeType === "percent") {
      deliveryStrategyAmount = round2(planBasis * (rawVal / 100));
    } else if (params.deliveryStrategy.chargeType === "fixed") {
      deliveryStrategyAmount = round2(rawVal);
    }
    deliveryStrategyInfo = {
      id: params.deliveryStrategy.id,
      name: params.deliveryStrategy.name,
      chargeType: params.deliveryStrategy.chargeType,
      chargeValue: rawVal,
      amount: deliveryStrategyAmount,
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

  const totalDeliveryCharge = round2(baseAmount + deliveryStrategyAmount + addressTagAmount);

  const lines: { label: string; amount: number }[] = [];
  if (baseAmount > 0) {
    lines.push({ label: "Base delivery charge", amount: baseAmount });
  }
  if (deliveryStrategyInfo && deliveryStrategyAmount > 0) {
    const detail = deliveryStrategyInfo.chargeType === "percent" ? ` (${deliveryStrategyInfo.chargeValue}%)` : "";
    lines.push({ label: `Delivery type: ${deliveryStrategyInfo.name}${detail}`, amount: deliveryStrategyAmount });
  }
  if (addressTagInfo && addressTagAmount > 0) {
    const detail = addressTagInfo.chargeType === "percent" ? ` (${addressTagInfo.chargeValue}%)` : "";
    lines.push({ label: `Address tag: ${addressTagInfo.name}${detail}`, amount: addressTagAmount });
  }

  return {
    baseAmount,
    deliveryStrategy: deliveryStrategyInfo,
    addressTag: addressTagInfo,
    totalDeliveryCharge,
    lines,
  };
}
