import { baseColumns, updatableColumns } from "@foundry/database";
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";

/** One personalization screen = one question. Asked to customers after signup. */
export const personalizationQuestionType = pgEnum("personalization_question_type", [
  "single",
  "multi",
  "text",
]);

export type PersonalizationOption = { id: string; label: string };

export const personalizationQuestions = pgTable(
  "personalization_questions",
  {
    ...updatableColumns("pnq"),
    prompt: text("prompt").notNull(),
    type: personalizationQuestionType("type").notNull(),
    /** Choices for single/multi; ignored for text. */
    options: jsonb("options").$type<PersonalizationOption[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    required: boolean("required").notNull().default(true),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    index("personalization_questions_active_sort_idx").on(t.active, t.sortOrder),
    index("personalization_questions_created_idx").on(t.createdAt),
  ],
);

export type PersonalizationAnswerValue =
  | { kind: "text"; text: string }
  | { kind: "single"; optionId: string }
  | { kind: "multi"; optionIds: string[] };

export const personalizationAnswers = pgTable(
  "personalization_answers",
  {
    ...baseColumns("pna"),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: bigint("question_id", { mode: "bigint" })
      .notNull()
      .references(() => personalizationQuestions.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<PersonalizationAnswerValue>().notNull(),
  },
  (t) => [
    uniqueIndex("personalization_answers_user_question_uidx").on(t.userId, t.questionId),
    index("personalization_answers_user_idx").on(t.userId),
    index("personalization_answers_question_idx").on(t.questionId),
  ],
);
