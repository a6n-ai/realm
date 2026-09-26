import { BaseDeliveryEntity } from "./BaseDeliveryEntity";

export abstract class BaseDeliveryOption extends BaseDeliveryEntity {
  // Optional foreign key to a tag (address tag)
  tagId?: bigint | null;
}
