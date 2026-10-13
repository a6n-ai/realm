import Link from "next/link";
import type { PersonalizationAnswerRow } from "@/lib/services/personalization.service";

export function PersonalizationAnswersList({
  rows,
  editHref,
}: {
  rows: PersonalizationAnswerRow[];
  /** When set, show a link for the customer to update answers. */
  editHref?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No personalization questions yet. Staff can add them under Settings → Personalization.
      </p>
    );
  }

  const answered = rows.filter((r) => r.answered);

  return (
    <div className="space-y-4">
      {editHref ? (
        <p className="text-muted-foreground text-sm">
          {answered.length === 0
            ? "Tell us a bit about your family so we can personalize your experience."
            : "Your answers help us tailor classes and communications."}{" "}
          <Link href={editHref} className="text-primary font-medium underline-offset-4 hover:underline">
            {answered.length === 0 ? "Answer questions" : "Update answers"}
          </Link>
        </p>
      ) : null}

      <dl className="divide-border divide-y">
        {rows.map((r) => (
          <div key={r.questionPublicId} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-4">
            <dt className="text-sm font-medium">{r.prompt}</dt>
            <dd className="text-muted-foreground text-sm sm:text-right">
              {r.answered ? (
                r.answer
              ) : (
                <span className="text-muted-foreground/80 italic">{r.answer}</span>
              )}
              {!r.active && r.answered ? (
                <span className="text-muted-foreground/70 ml-2 text-xs">(archived question)</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
