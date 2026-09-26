import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  deliveryChargeConfigs,
  deliveryOptions,
  deliveryTags,
  orders,
  users,
} from "@/db/schema";
import { ValidationError } from "@foundry/commons";
import {
  calculateDeliveryCharge,
  type DeliveryChargeCalculationResult,
  type DeliveryChargeItemLike,
  type DeliveryChargeType,
  type DeliveryOptionItemLike,
  type DeliveryTagItemLike,
} from "@/lib/pricing/delivery-charges";

export {
  calculateDeliveryCharge,
  type DeliveryChargeCalculationResult,
  type DeliveryChargeItemLike,
  type DeliveryChargeType,
  type DeliveryOptionItemLike,
  type DeliveryTagItemLike,
};

export type DeliveryTagDto = {
  id: string; // publicId
  internalId: bigint;
  name: string;
  description: string | null;
  chargeType: DeliveryChargeType;
  chargeValue: number;
  active: boolean;
  sortOrder: number;
};

export type DeliveryTagInput = {
  id?: string;
  name: string;
  description?: string | null;
  chargeType: DeliveryChargeType;
  chargeValue: number;
  active?: boolean;
};

export type DeliveryOptionDto = {
  id: string; // publicId
  internalId: bigint;
  tagId: string | null; // tag publicId
  tagInternalId: bigint | null;
  tagName: string | null;
  name: string;
  description: string | null;
  chargeType: DeliveryChargeType;
  chargeValue: number;
  active: boolean;
  sortOrder: number;
};

export type DeliveryOptionInput = {
  id?: string;
  tagId?: string | null; // tag publicId
  name: string;
  description?: string | null;
  chargeType: DeliveryChargeType;
  chargeValue: number;
  active?: boolean;
};

// Backward-compatible type aliases
export type DeliveryTypeDto = DeliveryOptionDto;
export type DeliveryTypeInput = DeliveryOptionInput;
export type AddressTagDto = DeliveryTagDto;
export type AddressTagInput = DeliveryTagInput;

export const deliveryChargesService = {
  async getBaseDeliveryCharge(orgId?: string | null): Promise<number> {
    const [row] = await db
      .select({ baseCharge: deliveryChargeConfigs.baseCharge })
      .from(deliveryChargeConfigs)
      .where(orgId ? eq(deliveryChargeConfigs.organizationId, orgId) : isNull(deliveryChargeConfigs.organizationId))
      .limit(1);
    return row ? Number(row.baseCharge) : 0;
  },

  async updateBaseDeliveryCharge(baseCharge: number, orgId?: string | null): Promise<number> {
    if (!Number.isFinite(baseCharge) || baseCharge < 0) {
      throw new ValidationError("Base delivery charge cannot be negative");
    }
    const val = baseCharge.toFixed(2);
    const [existing] = await db
      .select({ id: deliveryChargeConfigs.id })
      .from(deliveryChargeConfigs)
      .where(orgId ? eq(deliveryChargeConfigs.organizationId, orgId) : isNull(deliveryChargeConfigs.organizationId))
      .limit(1);

    if (existing) {
      await db
        .update(deliveryChargeConfigs)
        .set({ baseCharge: val, updatedAt: Date.now() })
        .where(eq(deliveryChargeConfigs.id, existing.id));
    } else {
      await db.insert(deliveryChargeConfigs).values({
        baseCharge: val,
        organizationId: orgId ?? null,
      });
    }
    return Number(val);
  },

  async listDeliveryTags(options?: { includeInactive?: boolean; orgId?: string | null }): Promise<DeliveryTagDto[]> {
    const conditions = [];
    if (!options?.includeInactive) {
      conditions.push(eq(deliveryTags.active, true));
    }
    if (options?.orgId) {
      conditions.push(or(eq(deliveryTags.organizationId, options.orgId), isNull(deliveryTags.organizationId)));
    }
    const rows = await db
      .select()
      .from(deliveryTags)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(deliveryTags.sortOrder), asc(deliveryTags.name));

    return rows.map((r) => ({
      id: r.publicId,
      internalId: r.id,
      name: r.name,
      description: r.description,
      chargeType: r.chargeType,
      chargeValue: Number(r.chargeValue),
      active: r.active,
      sortOrder: r.sortOrder,
    }));
  },

  async saveDeliveryTag(
    input: DeliveryTagInput,
    orgId?: string | null,
  ): Promise<DeliveryTagDto> {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Delivery tag name is required");
    if (!["none", "fixed", "percent"].includes(input.chargeType)) {
      throw new ValidationError("Invalid charge type");
    }
    const chargeVal = input.chargeType === "none" ? 0 : Number(input.chargeValue);
    if (!Number.isFinite(chargeVal) || chargeVal < 0) {
      throw new ValidationError("Charge value cannot be negative");
    }
    if (input.chargeType === "percent" && chargeVal > 100) {
      throw new ValidationError("Percentage charge cannot exceed 100%");
    }

    if (input.id) {
      const [duplicate] = await db
        .select({ id: deliveryTags.id })
        .from(deliveryTags)
        .where(and(eq(deliveryTags.name, name), sql`${deliveryTags.publicId} != ${input.id}`))
        .limit(1);
      if (duplicate) throw new ValidationError("A delivery tag with that name already exists");

      const [updated] = await db
        .update(deliveryTags)
        .set({
          name,
          description: input.description?.trim() || null,
          chargeType: input.chargeType,
          chargeValue: chargeVal.toFixed(2),
          active: input.active !== undefined ? input.active : true,
          updatedAt: Date.now(),
        })
        .where(eq(deliveryTags.publicId, input.id))
        .returning();
      if (!updated) throw new ValidationError("Delivery tag not found");
      return {
        id: updated.publicId,
        internalId: updated.id,
        name: updated.name,
        description: updated.description,
        chargeType: updated.chargeType,
        chargeValue: Number(updated.chargeValue),
        active: updated.active,
        sortOrder: updated.sortOrder,
      };
    } else {
      const [duplicate] = await db
        .select({ id: deliveryTags.id })
        .from(deliveryTags)
        .where(eq(deliveryTags.name, name))
        .limit(1);
      if (duplicate) throw new ValidationError("A delivery tag with that name already exists");

      const [created] = await db
        .insert(deliveryTags)
        .values({
          name,
          description: input.description?.trim() || null,
          chargeType: input.chargeType,
          chargeValue: chargeVal.toFixed(2),
          active: input.active !== undefined ? input.active : true,
          organizationId: orgId ?? null,
        })
        .returning();
      return {
        id: created.publicId,
        internalId: created.id,
        name: created.name,
        description: created.description,
        chargeType: created.chargeType,
        chargeValue: Number(created.chargeValue),
        active: created.active,
        sortOrder: created.sortOrder,
      };
    }
  },

  async deleteDeliveryTag(publicId: string): Promise<{ success: boolean; deactivatedInstead?: boolean }> {
    const [row] = await db
      .select({ id: deliveryTags.id })
      .from(deliveryTags)
      .where(eq(deliveryTags.publicId, publicId))
      .limit(1);
    if (!row) throw new ValidationError("Delivery tag not found");

    const [[orderRef], [userRef], [optionRef]] = await Promise.all([
      db.select({ id: orders.id }).from(orders).where(or(eq(orders.deliveryTagId, row.id), eq(orders.addressTagId, row.id))).limit(1),
      db.select({ id: users.id }).from(users).where(or(eq(users.deliveryTagId, row.id), eq(users.addressTagId, row.id))).limit(1),
      db.select({ id: deliveryOptions.id }).from(deliveryOptions).where(eq(deliveryOptions.tagId, row.id)).limit(1),
    ]);

    if (orderRef || userRef || optionRef) {
      await db
        .update(deliveryTags)
        .set({ active: false, updatedAt: Date.now() })
        .where(eq(deliveryTags.id, row.id));
      return { success: true, deactivatedInstead: true };
    }

    await db.delete(deliveryTags).where(eq(deliveryTags.id, row.id));
    return { success: true, deactivatedInstead: false };
  },

  async listDeliveryOptions(options?: { tagId?: string | null; includeInactive?: boolean; orgId?: string | null }): Promise<DeliveryOptionDto[]> {
    const conditions = [];
    if (!options?.includeInactive) {
      conditions.push(eq(deliveryOptions.active, true));
    }
    if (options?.orgId) {
      conditions.push(or(eq(deliveryOptions.organizationId, options.orgId), isNull(deliveryOptions.organizationId)));
    }
    if (options?.tagId) {
      const [tag] = await db.select({ id: deliveryTags.id }).from(deliveryTags).where(eq(deliveryTags.publicId, options.tagId)).limit(1);
      if (tag) {
        conditions.push(eq(deliveryOptions.tagId, tag.id));
      }
    }
    const rows = await db
      .select({
        opt: deliveryOptions,
        tag: {
          publicId: deliveryTags.publicId,
          name: deliveryTags.name,
        },
      })
      .from(deliveryOptions)
      .leftJoin(deliveryTags, eq(deliveryOptions.tagId, deliveryTags.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(deliveryOptions.sortOrder), asc(deliveryOptions.name));

    return rows.map(({ opt, tag }) => ({
      id: opt.publicId,
      internalId: opt.id,
      tagId: tag?.publicId ?? null,
      tagInternalId: opt.tagId,
      tagName: tag?.name ?? null,
      name: opt.name,
      description: opt.description,
      chargeType: opt.chargeType,
      chargeValue: Number(opt.chargeValue),
      active: opt.active,
      sortOrder: opt.sortOrder,
    }));
  },

  async saveDeliveryOption(
    input: DeliveryOptionInput,
    orgId?: string | null,
  ): Promise<DeliveryOptionDto> {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Delivery option name is required");
    if (!["none", "fixed", "percent"].includes(input.chargeType)) {
      throw new ValidationError("Invalid charge type");
    }
    const chargeVal = input.chargeType === "none" ? 0 : Number(input.chargeValue);
    if (!Number.isFinite(chargeVal) || chargeVal < 0) {
      throw new ValidationError("Charge value cannot be negative");
    }
    if (input.chargeType === "percent" && chargeVal > 100) {
      throw new ValidationError("Percentage charge cannot exceed 100%");
    }

    let tagInternalId: bigint | null = null;
    let tagName: string | null = null;
    if (input.tagId) {
      const [tagRow] = await db
        .select({ id: deliveryTags.id, name: deliveryTags.name })
        .from(deliveryTags)
        .where(eq(deliveryTags.publicId, input.tagId))
        .limit(1);
      if (!tagRow) throw new ValidationError("Selected address tag not found");
      tagInternalId = tagRow.id;
      tagName = tagRow.name;
    }

    if (input.id) {
      const [duplicate] = await db
        .select({ id: deliveryOptions.id })
        .from(deliveryOptions)
        .where(
          and(
            eq(deliveryOptions.name, name),
            tagInternalId ? eq(deliveryOptions.tagId, tagInternalId) : isNull(deliveryOptions.tagId),
            sql`${deliveryOptions.publicId} != ${input.id}`,
          ),
        )
        .limit(1);
      if (duplicate) throw new ValidationError("A delivery option with that name already exists for this tag");

      const [updated] = await db
        .update(deliveryOptions)
        .set({
          tagId: tagInternalId,
          name,
          description: input.description?.trim() || null,
          chargeType: input.chargeType,
          chargeValue: chargeVal.toFixed(2),
          active: input.active !== undefined ? input.active : true,
          updatedAt: Date.now(),
        })
        .where(eq(deliveryOptions.publicId, input.id))
        .returning();
      if (!updated) throw new ValidationError("Delivery option not found");

      return {
        id: updated.publicId,
        internalId: updated.id,
        tagId: input.tagId ?? null,
        tagInternalId: updated.tagId,
        tagName,
        name: updated.name,
        description: updated.description,
        chargeType: updated.chargeType,
        chargeValue: Number(updated.chargeValue),
        active: updated.active,
        sortOrder: updated.sortOrder,
      };
    } else {
      const [duplicate] = await db
        .select({ id: deliveryOptions.id })
        .from(deliveryOptions)
        .where(
          and(
            eq(deliveryOptions.name, name),
            tagInternalId ? eq(deliveryOptions.tagId, tagInternalId) : isNull(deliveryOptions.tagId),
          ),
        )
        .limit(1);
      if (duplicate) throw new ValidationError("A delivery option with that name already exists for this tag");

      const [created] = await db
        .insert(deliveryOptions)
        .values({
          tagId: tagInternalId,
          name,
          description: input.description?.trim() || null,
          chargeType: input.chargeType,
          chargeValue: chargeVal.toFixed(2),
          active: input.active !== undefined ? input.active : true,
          organizationId: orgId ?? null,
        })
        .returning();

      return {
        id: created.publicId,
        internalId: created.id,
        tagId: input.tagId ?? null,
        tagInternalId: created.tagId,
        tagName,
        name: created.name,
        description: created.description,
        chargeType: created.chargeType,
        chargeValue: Number(created.chargeValue),
        active: created.active,
        sortOrder: created.sortOrder,
      };
    }
  },

  async deleteDeliveryOption(publicId: string): Promise<{ success: boolean; deactivatedInstead?: boolean }> {
    const [row] = await db
      .select({ id: deliveryOptions.id })
      .from(deliveryOptions)
      .where(eq(deliveryOptions.publicId, publicId))
      .limit(1);
    if (!row) throw new ValidationError("Delivery option not found");

    const [[orderRef], [userRef]] = await Promise.all([
      db.select({ id: orders.id }).from(orders).where(or(eq(orders.deliveryOptionId, row.id), eq(orders.deliveryTypeId, row.id))).limit(1),
      db.select({ id: users.id }).from(users).where(or(eq(users.deliveryOptionId, row.id), eq(users.deliveryTypeId, row.id))).limit(1),
    ]);

    if (orderRef || userRef) {
      await db
        .update(deliveryOptions)
        .set({ active: false, updatedAt: Date.now() })
        .where(eq(deliveryOptions.id, row.id));
      return { success: true, deactivatedInstead: true };
    }

    await db.delete(deliveryOptions).where(eq(deliveryOptions.id, row.id));
    return { success: true, deactivatedInstead: false };
  },

  // Backward compatibility alias methods
  async listAddressTags(options?: { includeInactive?: boolean; orgId?: string | null }) {
    return this.listDeliveryTags(options);
  },
  async saveAddressTag(input: AddressTagInput, orgId?: string | null) {
    return this.saveDeliveryTag(input, orgId);
  },
  async deleteAddressTag(publicId: string) {
    return this.deleteDeliveryTag(publicId);
  },
  async listDeliveryTypes(options?: { includeInactive?: boolean; orgId?: string | null }) {
    return this.listDeliveryOptions(options);
  },
  async saveDeliveryType(input: DeliveryTypeInput, orgId?: string | null) {
    return this.saveDeliveryOption(input, orgId);
  },
  async deleteDeliveryType(publicId: string) {
    return this.deleteDeliveryOption(publicId);
  },
};
