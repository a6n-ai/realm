import type { PersonalizationAnswerValue, PersonalizationOption } from "@/db/schema";
import type { QuestionType } from "@/lib/services/personalization.service";

export function formatPersonalizationAnswer(
  type: QuestionType,
  value: PersonalizationAnswerValue | null | undefined,
  options: PersonalizationOption[],
): string {
  if (!value) return "Not answered";

  switch (value.kind) {
    case "text": {
      const text = value.text.trim();
      return text || "Skipped";
    }
    case "single": {
      if (!value.optionId) return "Skipped";
      return options.find((o) => o.id === value.optionId)?.label ?? "Unknown option";
    }
    case "multi": {
      if (value.optionIds.length === 0) return "Skipped";
      return value.optionIds
        .map((id) => options.find((o) => o.id === id)?.label ?? "Unknown")
        .join(", ");
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}
