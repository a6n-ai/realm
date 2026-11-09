// Plain value lists behind the pgEnums. No drizzle and no lib imports, so the schema, lib code, zod
// schemas and UI all derive from one list. Values and order are the Postgres enum order: never reorder.

/** The one week order (Monday first). */
export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof WEEK_DAYS)[number];
export const MON_FRI: readonly DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];

export const PLAN_TYPES = ["tiffin", "healthy"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const MEAL_TIERS = ["budget", "medium", "premium"] as const;
export type MealTier = (typeof MEAL_TIERS)[number];

export const MEAL_ITEM_ROLES = ["main", "side_1", "side_2"] as const;
export type MealItemRole = (typeof MEAL_ITEM_ROLES)[number];

export const MEAL_RULE_CONDITIONS = ["exclusive_to_plan"] as const;
export const MEAL_RULE_MATCH_MODES = ["all", "any"] as const;
/** max_qualifying: at most `actionValue` picks match; forbid: none may match; cannot_coexist: at most one distinct matching dish. */
export const MEAL_RULE_ACTIONS = ["max_qualifying", "forbid", "cannot_coexist"] as const;
export type MealRuleAction = (typeof MEAL_RULE_ACTIONS)[number];
export const MEAL_RULE_FIELDS = ["dish_plan", "category", "dish", "dish_name"] as const;
export type MealRuleField = (typeof MEAL_RULE_FIELDS)[number];
export const MEAL_RULE_OPERATORS = [
  "is", "is_not", "is_one_of", "is_not_one_of",
  "contains", "not_contains", "equals", "starts_with", "ends_with",
] as const;
export type MealRuleOperator = (typeof MEAL_RULE_OPERATORS)[number];

export const TICKET_STATUSES = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
/** Statuses where the ticket still needs work. */
export const OPEN_TICKET_STATUSES = ["open", "in_progress", "waiting_on_customer"] as const satisfies readonly TicketStatus[];
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const REFERRAL_STATUSES = ["joined", "ordered", "rewarded", "reversed"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
