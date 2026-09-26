export abstract class BaseDeliveryEntity {
  id: bigint;
  publicId: string;
  name: string;
  description?: string;
  chargeType: 'fixed' | 'percentage' | 'none';
  chargeValue: number;
  active: boolean;
  sortOrder: number;
}
