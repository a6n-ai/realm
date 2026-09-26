import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  addressTags,
  deliveryChargeConfigs,
  deliveryStrategies,
  orders,
  users,
} from "@/db/schema";
import { ValidationError } from "@foundry/commons";
import {
  calculateDeliveryCharge,
  type DeliveryChargeCalculationResult,
  type DeliveryChargeItemLike,
  type DeliveryChargeType,
} from "@/lib/pricing/delivery-charges";

export {
  calculateDeliveryCharge,
  type DeliveryChargeCalculationResult,
  type DeliveryChargeItemLike,
  type DeliveryChargeType,
};

export type DeliveryTypeDto = {
  id: string; // publicId
  internalId: bigint;
  name: string;
  description: string | null;
  chargeType: DeliveryChargeType;
  chargeValue: number;
  active: boolean;
  sortOrder: number;
};

export type DeliveryTypeInput = {
  id?: string;
  name: string;
  description?: string | null;
  chargeType: DeliveryChargeType;
  chargeValue: number;
  active?: boolean;
};

export type AddressTagDto = {
  id: string; // publicId
  internalId: bigint;
  name: string;
  description: string | null;
  chargeType: DeliveryChargeType;
  chargeValue: number;
  active: boolean;
  sortOrder: number;
};

export type AddressTagInput = {
  id?: string;
  name: string;
  description?: string | null;
  chargeType: DeliveryChargeType;
  chargeValue: number;
  active?: boolean;
};

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

  async listDeliveryTypes(options?: { includeInactive?: boolean; orgId?: string | null }): Promise<DeliveryTypeDto[]> {
    const conditions = [];
    if (!options?.includeInactive) {
      conditions.push(eq(deliveryTypes.active, true));
    }
    if (options?.orgId) {
      conditions.push(or(eq(deliveryTypes.organizationId, options.orgId), isNull(deliveryTypes.organizationId)));
    }
    const rows = await db
      .select()
      .from(deliveryTypes)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(deliveryTypes.sortOrder), asc(deliveryTypes.name));

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

  async saveDeliveryType(
    input: {
      id?: string; // publicId if updating
      name: string;
      description?: string | null;
      chargeType: DeliveryChargeType;
      chargeValue: number;
      active?: boolean;
    },
    orgId?: string | null,
  ): Promise<DeliveryTypeDto> {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Delivery type name is required");
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
      // Check for name collisions
      const [duplicate] = await db
        .select({ id: deliveryTypes.id })
        .from(deliveryTypes)
        .where(and(eq(deliveryTypes.name, name), sql`${deliveryTypes.publicId} != ${input.id}`))
        .limit(1);
      if (duplicate) throw new ValidationError("A delivery type with that name already exists");

      const [updated] = await db
        .update(deliveryTypes)
        .set({
          name,
          description: input.description?.trim() || null,
          chargeType: input.chargeType,
          chargeValue: chargeVal.toFixed(2),
          active: input.active !== undefined ? input.active : true,
          updatedAt: Date.now(),
        })
        .where(eq(deliveryTypes.publicId, input.id))
        .returning();
      if (!updated) throw new ValidationError("Delivery type not found");
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
      // Create
      const [duplicate] = await db
        .select({ id: deliveryTypes.id })
        .from(deliveryTypes)
        .where(eq(deliveryTypes.name, name))
        .limit(1);
      if (duplicate) throw new ValidationError("A delivery type with that name already exists");

      const [created] = await db
        .insert(deliveryTypes)
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

  async deleteDeliveryType(publicId: string): Promise<{ success: boolean; deactivatedInstead?: boolean }> {
    const [row] = await db
      .select({ id: deliveryTypes.id })
      .from(deliveryTypes)
      .where(eq(deliveryTypes.publicId, publicId))
      .limit(1);
    if (!row) throw new ValidationError("Delivery type not found");

    // Check if referenced by existing orders or users
    const [[orderRef], [userRef]] = await Promise.all([
      db.select({ id: orders.id }).from(orders).where(eq(orders.deliveryTypeId, row.id)).limit(1),
      db.select({ id: users.id }).from(users).where(eq(users.deliveryTypeId, row.id)).limit(1),
    ]);

    if (orderRef || userRef) {
      // Deactivate instead of hard deleting to preserve historical data
      await db
        .update(deliveryTypes)
        .set({ active: false, updatedAt: Date.now() })
        .where(eq(deliveryTypes.id, row.id));
      return { success: true, deactivatedInstead: true };
    }

    await db.delete(deliveryTypes).where(eq(deliveryTypes.id, row.id));
    return { success: true, deactivatedInstead: false };
  },

  async listAddressTags(options?: { includeInactive?: boolean; orgId?: string | null }): Promise<AddressTagDto[]> {
    const conditions = [];
    if (!options?.includeInactive) {
      conditions.push(eq(addressTags.active, true));
    }
    if (options?.orgId) {
      conditions.push(or(eq(addressTags.organizationId, options.orgId), isNull(addressTags.organizationId)));
    }
    const rows = await db
      .select()
      .from(addressTags)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(addressTags.sortOrder), asc(addressTags.name));

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

  async saveAddressTag(
    input: {
      id?: string; // publicId if updating
      name: string;
      description?: string | null;
      chargeType: DeliveryChargeType;
      chargeValue: number;
      active?: boolean;
    },
    orgId?: string | null,
  ): Promise<AddressTagDto> {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Address tag name is required");
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
        .select({ id: addressTags.id })
        .from(addressTags)
        .where(and(eq(addressTags.name, name), sql`${addressTags.publicId} != ${input.id}`))
        .limit(1);
      if (duplicate) throw new ValidationError("An address tag with that name already exists");

      const [updated] = await db
        .update(addressTags)
        .set({
          name,
          description: input.description?.trim() || null,
          chargeType: input.chargeType,
          chargeValue: chargeVal.toFixed(2),
          active: input.active !== undefined ? input.active : true,
          updatedAt: Date.now(),
        })
        .where(eq(addressTags.publicId, input.id))
        .returning();
      if (!updated) throw new ValidationError("Address tag not found");
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
        .select({ id: addressTags.id })
        .from(addressTags)
        .where(eq(addressTags.name, name))
        .limit(1);
      if (duplicate) throw new ValidationError("An address tag with that name already exists");

      const [created] = await db
        .insert(addressTags)
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

  async deleteAddressTag(publicId: string): Promise<{ success: boolean; deactivatedInstead?: boolean }> {
    const [row] = await db
      .select({ id: addressTags.id })
      .from(addressTags)
      .where(eq(addressTags.publicId, publicId))
      .limit(1);
    if (!row) throw new ValidationError("Address tag not found");

    const [[orderRef], [userRef]] = await Promise.all([
      db.select({ id: orders.id }).from(orders).where(eq(orders.addressTagId, row.id)).limit(1),
      db.select({ id: users.id }).from(users).where(eq(users.addressTagId, row.id)).limit(1),
    ]);

    if (orderRef || userRef) {
      await db
        .update(addressTags)
        .set({ active: false, updatedAt: Date.now() })
        .where(eq(addressTags.id, row.id));
      return { success: true, deactivatedInstead: true };
    }

    await db.delete(addressTags).where(eq(addressTags.id, row.id));
    return { success: true, deactivatedInstead: false };
  },
};
