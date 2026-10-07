import { SparklesIcon } from "lucide-react";
import { PageHeader, SectionCard } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { personalizationService } from "@/lib/services/personalization.service";
import { QuestionBuilder } from "./question-builder";

export default async function PersonalizationSettingsPage() {
  await requireAdmin();
  const questions = await personalizationService.listAdmin();

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={SparklesIcon}
        title="Personalization"
        subtitle="Build the questions new families answer after signup — one question per screen."
      />
      <SectionCard title="Question screens" subtitle="Order is the customer flow. Turn a question off to hide it without deleting answers.">
        <QuestionBuilder questions={questions} />
      </SectionCard>
    </div>
  );
}
