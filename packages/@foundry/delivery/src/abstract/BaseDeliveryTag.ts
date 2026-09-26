import { BaseDeliveryEntity } from "./BaseDeliveryEntity";

/**
 * Abstract class representing a delivery tag (address tag).
 * Extends BaseDeliveryEntity and can optionally have a collection of
 * associated delivery options.
 */
export abstract class BaseDeliveryTag extends BaseDeliveryEntity {
  /**
   * Optional list of delivery options that belong to this tag.
   * This is a convenience for UI rendering; the actual relationship is
   * defined in the concrete implementation via a foreign‑key.
   */
  options?: BaseDeliveryEntity[];
}
