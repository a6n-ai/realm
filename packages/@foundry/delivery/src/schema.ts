import { pgTable, serial, varchar, bigint, boolean, integer, text } from 'drizzle-orm/pg-core';

// Delivery Options table
export const deliveryOptions = pgTable('delivery_options', {
  id: serial('id').primaryKey(),
  publicId: varchar('public_id', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  chargeType: varchar('charge_type', { length: 20 }).notNull(), // 'fixed' | 'percentage' | 'none'
  chargeValue: integer('charge_value').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  tagId: bigint('tag_id', { mode: 'bigint' }) // FK to delivery_tags.id (optional)
});

// Delivery Tags (address tags) table
export const deliveryTags = pgTable('delivery_tags', {
  id: serial('id').primaryKey(),
  publicId: varchar('public_id', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0)
});

// Legacy tables kept for migration compatibility – they will be aliases to the new ones.
// Legacy alias removed per user request

