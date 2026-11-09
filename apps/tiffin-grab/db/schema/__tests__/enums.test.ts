import { describe, expect, it } from "vitest";
import * as e from "../enums";
import { mealItemRole, mealTier, planType } from "../catalog";
import { mealRuleAction, mealRuleCondition, mealRuleField, mealRuleMatchMode, mealRuleOperator } from "../meal-rules";
import { dayOfWeek } from "../menu";
import { referralStatus } from "../referrals";
import { ticketPriority, ticketStatus } from "../tickets";

describe("schema enums derive from enums.ts", () => {
  it.each([
    [dayOfWeek, e.WEEK_DAYS], [planType, e.PLAN_TYPES], [mealTier, e.MEAL_TIERS], [mealItemRole, e.MEAL_ITEM_ROLES],
    [mealRuleCondition, e.MEAL_RULE_CONDITIONS], [mealRuleMatchMode, e.MEAL_RULE_MATCH_MODES], [mealRuleAction, e.MEAL_RULE_ACTIONS],
    [mealRuleField, e.MEAL_RULE_FIELDS], [mealRuleOperator, e.MEAL_RULE_OPERATORS],
    [ticketStatus, e.TICKET_STATUSES], [ticketPriority, e.TICKET_PRIORITIES], [referralStatus, e.REFERRAL_STATUSES],
  ])("%#", (pg, list) => expect(pg.enumValues).toEqual([...list]));
});
