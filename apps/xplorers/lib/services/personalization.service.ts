import { AuthError, ForbiddenError, NotFoundError, Role, ValidationError } from "@foundry/commons";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  personalizationAnswers,
  personalizationQuestions,
  users,
  type PersonalizationAnswerValue,
  type PersonalizationOption,
} from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { formatPersonalizationAnswer } from "@/lib/personalization/format-answer";
import { currentUserId } from "./session-service";

export type QuestionType = "single" | "multi" | "text";

export type QuestionDto = {
  publicId: string;
  prompt: string;
  type: QuestionType;
  options: PersonalizationOption[];
  sortOrder: number;
  required: boolean;
  active: boolean;
};

export type CustomerQuestion = {
  publicId: string;
  prompt: string;
  type: QuestionType;
  options: PersonalizationOption[];
  required: boolean;
  index: number;
  total: number;
};

export type PersonalizationAnswerRow = {
  questionPublicId: string;
  prompt: string;
  type: QuestionType;
  answer: string;
  answered: boolean;
  active: boolean;
};

const TYPES = new Set<QuestionType>(["single", "multi", "text"]);

function optionId(): string {
  return `opt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function normalizeOptions(raw: unknown, type: QuestionType): PersonalizationOption[] {
  if (type === "text") return [];
  if (!Array.isArray(raw)) throw new ValidationError("Add at least two options");
  const labels = raw
    .map((o) => (typeof o === "string" ? o : o && typeof o === "object" && "label" in o ? String((o as { label: unknown }).label) : ""))
    .map((l) => l.trim())
    .filter(Boolean);
  if (labels.length < 2) throw new ValidationError("Add at least two options");
  if (labels.length > 20) throw new ValidationError("At most 20 options");
  return labels.map((label) => ({ id: optionId(), label }));
}

function toDto(row: typeof personalizationQuestions.$inferSelect): QuestionDto {
  return {
    publicId: row.publicId,
    prompt: row.prompt,
    type: row.type,
    options: row.options ?? [],
    sortOrder: row.sortOrder,
    required: row.required,
    active: row.active,
  };
}

async function requireStaff(): Promise<bigint> {
  const session = await getSession();
  const id = await currentUserId();
  if (!session || id == null) throw new AuthError();
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.MEMBER) throw new ForbiddenError();
  if (session.user.role === Role.MEMBER) throw new ForbiddenError();
  return id;
}

async function requireCustomer(): Promise<{ publicId: string; id: bigint }> {
  const session = await getSession();
  const id = await currentUserId();
  if (!session || id == null) throw new AuthError();
  if (session.user.role !== Role.USER) throw new ForbiddenError();
  return { publicId: session.user.id, id };
}

async function resolveCustomerUserId(userPublicId: string): Promise<bigint> {
  const [row] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.publicId, userPublicId))
    .limit(1);
  if (!row || row.role !== Role.USER) throw new NotFoundError("Customer not found");
  return row.id;
}

function parseAnswer(
  type: QuestionType,
  options: PersonalizationOption[],
  raw: unknown,
): PersonalizationAnswerValue {
  if (type === "text") {
    const text = String(raw ?? "").trim();
    if (!text) throw new ValidationError("Please write an answer");
    if (text.length > 500) throw new ValidationError("Keep your answer under 500 characters");
    return { kind: "text", text };
  }
  const ids = new Set(options.map((o) => o.id));
  if (type === "single") {
    const optionId = String(raw ?? "");
    if (!ids.has(optionId)) throw new ValidationError("Pick one option");
    return { kind: "single", optionId };
  }
  const optionIds = Array.isArray(raw) ? raw.map(String) : [];
  if (optionIds.length === 0) throw new ValidationError("Pick at least one option");
  if (optionIds.some((id) => !ids.has(id))) throw new ValidationError("Invalid option");
  return { kind: "multi", optionIds };
}

export const personalizationService = {
  async listAdmin(): Promise<QuestionDto[]> {
    await requireStaff();
    const rows = await db.select().from(personalizationQuestions).orderBy(asc(personalizationQuestions.sortOrder), asc(personalizationQuestions.createdAt));
    return rows.map(toDto);
  },

  async create(input: {
    prompt: string;
    type: string;
    options?: unknown;
    required?: boolean;
    active?: boolean;
  }): Promise<QuestionDto> {
    const actor = await requireStaff();
    const prompt = String(input.prompt ?? "").trim();
    if (!prompt) throw new ValidationError("Question text is required");
    if (prompt.length > 280) throw new ValidationError("Keep the question under 280 characters");
    const type = input.type as QuestionType;
    if (!TYPES.has(type)) throw new ValidationError("Choose single choice, multi choice, or text");
    const options = normalizeOptions(input.options, type);
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${personalizationQuestions.sortOrder}), -1)` })
      .from(personalizationQuestions);
    const [row] = await db
      .insert(personalizationQuestions)
      .values({
        prompt,
        type,
        options,
        sortOrder: Number(max) + 1,
        required: input.required !== false,
        active: input.active !== false,
        createdBy: actor,
        updatedBy: actor,
      })
      .returning();
    return toDto(row!);
  },

  async update(
    publicId: string,
    input: {
      prompt?: string;
      type?: string;
      options?: unknown;
      required?: boolean;
      active?: boolean;
    },
  ): Promise<QuestionDto> {
    const actor = await requireStaff();
    const [existing] = await db
      .select()
      .from(personalizationQuestions)
      .where(eq(personalizationQuestions.publicId, publicId))
      .limit(1);
    if (!existing) throw new NotFoundError("Question not found");

    const type = (input.type as QuestionType | undefined) ?? existing.type;
    if (!TYPES.has(type)) throw new ValidationError("Choose single choice, multi choice, or text");
    const prompt = input.prompt != null ? String(input.prompt).trim() : existing.prompt;
    if (!prompt) throw new ValidationError("Question text is required");
    if (prompt.length > 280) throw new ValidationError("Keep the question under 280 characters");

    let options = existing.options ?? [];
    if (type === "text") options = [];
    else if (input.options !== undefined) {
      // Keep stable ids when the label is unchanged so past answers still match.
      const incoming = Array.isArray(input.options) ? input.options : [];
      const byLabel = new Map(options.map((o) => [o.label.toLowerCase(), o]));
      const next: PersonalizationOption[] = [];
      for (const item of incoming) {
        const label = (typeof item === "string" ? item : item && typeof item === "object" && "label" in item ? String((item as { label: unknown }).label) : "").trim();
        if (!label) continue;
        const prev = byLabel.get(label.toLowerCase());
        next.push(prev ?? { id: optionId(), label });
      }
      if (next.length < 2) throw new ValidationError("Add at least two options");
      if (next.length > 20) throw new ValidationError("At most 20 options");
      options = next;
    } else if (existing.type === "text") {
      throw new ValidationError("Add at least two options");
    }

    const [row] = await db
      .update(personalizationQuestions)
      .set({
        prompt,
        type,
        options,
        required: input.required ?? existing.required,
        active: input.active ?? existing.active,
        updatedBy: actor,
        updatedAt: Date.now(),
      })
      .where(eq(personalizationQuestions.id, existing.id))
      .returning();
    return toDto(row!);
  },

  async remove(publicId: string): Promise<void> {
    await requireStaff();
    await db.delete(personalizationQuestions).where(eq(personalizationQuestions.publicId, publicId));
  },

  async reorder(publicIds: string[]): Promise<void> {
    const actor = await requireStaff();
    if (!Array.isArray(publicIds) || publicIds.length === 0) return;
    const rows = await db
      .select({ id: personalizationQuestions.id, publicId: personalizationQuestions.publicId })
      .from(personalizationQuestions)
      .where(inArray(personalizationQuestions.publicId, publicIds));
    if (rows.length !== publicIds.length) throw new ValidationError("Unknown question in order");
    const byPublic = new Map(rows.map((r) => [r.publicId, r.id]));
    await db.transaction(async (tx) => {
      for (let i = 0; i < publicIds.length; i++) {
        const id = byPublic.get(publicIds[i]!);
        if (id == null) continue;
        await tx
          .update(personalizationQuestions)
          .set({ sortOrder: i, updatedBy: actor, updatedAt: Date.now() })
          .where(eq(personalizationQuestions.id, id));
      }
    });
  },

  /** Active questions the customer still needs, or the next edit screen when `edit` is set. */
  async nextForCustomer(opts?: { edit?: boolean; afterPublicId?: string }): Promise<CustomerQuestion | null> {
    const me = await requireCustomer();
    const active = await db
      .select()
      .from(personalizationQuestions)
      .where(eq(personalizationQuestions.active, true))
      .orderBy(asc(personalizationQuestions.sortOrder), asc(personalizationQuestions.createdAt));
    if (active.length === 0) return null;

    if (opts?.edit) {
      let startIdx = 0;
      if (opts.afterPublicId) {
        const idx = active.findIndex((q) => q.publicId === opts.afterPublicId);
        startIdx = idx >= 0 ? idx + 1 : 0;
      }
      const next = active[startIdx];
      if (!next) return null;
      return {
        publicId: next.publicId,
        prompt: next.prompt,
        type: next.type,
        options: next.options ?? [],
        required: next.required,
        index: startIdx,
        total: active.length,
      };
    }

    const answered = await db
      .select({ questionId: personalizationAnswers.questionId })
      .from(personalizationAnswers)
      .where(eq(personalizationAnswers.userId, me.id));
    const done = new Set(answered.map((a) => a.questionId));
    const pending = active.filter((q) => !done.has(q.id));
    if (pending.length === 0) return null;

    const requiredPending = pending.filter((q) => q.required);
    const next = (requiredPending[0] ?? pending[0])!;
    const index = active.findIndex((q) => q.id === next.id);
    return {
      publicId: next.publicId,
      prompt: next.prompt,
      type: next.type,
      options: next.options ?? [],
      required: next.required,
      index: Math.max(0, index),
      total: active.length,
    };
  },

  /** Answers for one family — staff on customer 360, customers on their own account. */
  async listAnswersForUser(userPublicId: string): Promise<PersonalizationAnswerRow[]> {
    const session = await getSession();
    const viewerId = await currentUserId();
    if (!session || viewerId == null) throw new AuthError();

    const isStaff = session.user.role === Role.ADMIN || session.user.role === Role.MEMBER;
    if (isStaff) {
      if (session.user.role === Role.MEMBER) throw new ForbiddenError();
    } else if (session.user.role !== Role.USER || session.user.id !== userPublicId) {
      throw new ForbiddenError();
    }

    const userId = await resolveCustomerUserId(userPublicId);

    const questions = await db
      .select()
      .from(personalizationQuestions)
      .orderBy(asc(personalizationQuestions.sortOrder), asc(personalizationQuestions.createdAt));

    const answers = await db
      .select({
        questionId: personalizationAnswers.questionId,
        value: personalizationAnswers.value,
      })
      .from(personalizationAnswers)
      .where(eq(personalizationAnswers.userId, userId));

    const byQuestion = new Map(answers.map((a) => [a.questionId, a.value]));

    return questions
      .filter((q) => q.active || byQuestion.has(q.id))
      .map((q) => {
        const value = byQuestion.get(q.id);
        const formatted = formatPersonalizationAnswer(q.type, value, q.options ?? []);
        return {
          questionPublicId: q.publicId,
          prompt: q.prompt,
          type: q.type,
          answer: formatted,
          answered: value != null && formatted !== "Not answered" && formatted !== "Skipped",
          active: q.active,
        };
      });
  },

  /** True when every active required question has an answer (or there are none). */
  async isCompleteForCustomer(): Promise<boolean> {
    const id = await currentUserId();
    if (id == null) return true;

    const required = await db
      .select({ id: personalizationQuestions.id })
      .from(personalizationQuestions)
      .where(and(eq(personalizationQuestions.active, true), eq(personalizationQuestions.required, true)));
    if (required.length === 0) return true;

    const answered = await db
      .select({ questionId: personalizationAnswers.questionId })
      .from(personalizationAnswers)
      .where(
        and(
          eq(personalizationAnswers.userId, id),
          inArray(
            personalizationAnswers.questionId,
            required.map((q) => q.id),
          ),
        ),
      );
    return answered.length >= required.length;
  },

  async answer(
    questionPublicId: string,
    raw: unknown,
    opts?: { edit?: boolean },
  ): Promise<{ done: boolean }> {
    const me = await requireCustomer();
    const [q] = await db
      .select()
      .from(personalizationQuestions)
      .where(and(eq(personalizationQuestions.publicId, questionPublicId), eq(personalizationQuestions.active, true)))
      .limit(1);
    if (!q) throw new NotFoundError("That question is no longer available");

    const value = parseAnswer(q.type, q.options ?? [], raw);
    await db
      .insert(personalizationAnswers)
      .values({
        userId: me.id,
        questionId: q.id,
        value,
        createdBy: me.id,
      })
      .onConflictDoUpdate({
        target: [personalizationAnswers.userId, personalizationAnswers.questionId],
        set: { value },
      });

    const next = await this.nextForCustomer(
      opts?.edit ? { edit: true, afterPublicId: questionPublicId } : undefined,
    );
    return { done: next == null };
  },

  async skip(questionPublicId: string, opts?: { edit?: boolean }): Promise<{ done: boolean }> {
    const me = await requireCustomer();
    const [q] = await db
      .select()
      .from(personalizationQuestions)
      .where(and(eq(personalizationQuestions.publicId, questionPublicId), eq(personalizationQuestions.active, true)))
      .limit(1);
    if (!q) throw new NotFoundError("That question is no longer available");
    if (q.required) throw new ValidationError("This question is required");

    // Store an empty marker so skip advances; optional text/multi can be empty-ish.
    const value: PersonalizationAnswerValue =
      q.type === "text"
        ? { kind: "text", text: "" }
        : q.type === "single"
          ? { kind: "single", optionId: "" }
          : { kind: "multi", optionIds: [] };

    await db
      .insert(personalizationAnswers)
      .values({
        userId: me.id,
        questionId: q.id,
        value,
        createdBy: me.id,
      })
      .onConflictDoUpdate({
        target: [personalizationAnswers.userId, personalizationAnswers.questionId],
        set: { value },
      });

    const next = await this.nextForCustomer(
      opts?.edit ? { edit: true, afterPublicId: questionPublicId } : undefined,
    );
    return { done: next == null };
  },
};
