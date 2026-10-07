import type { PersonalizationAnswerRow } from "@/lib/services/personalization.service";
import { PersonalizationAnswersList } from "@/components/personalization/answers-list";

export function AboutPanel({ rows }: { rows: PersonalizationAnswerRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">About you</h2>
        <p className="text-muted-foreground text-sm">Personalization answers you shared with us.</p>
      </div>
      <PersonalizationAnswersList rows={rows} editHref="/me/welcome?edit=1" />
    </div>
  );
}
