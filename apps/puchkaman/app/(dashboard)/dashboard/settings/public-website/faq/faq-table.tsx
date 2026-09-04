"use client";

import { useTransition } from "react";
import { HelpCircleIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import type { Faq } from "@/lib/services/faqs.service";
import { saveFaqAction } from "./actions";

type FaqCol = "question" | "answer" | "status" | "actions";

const COLUMNS: readonly Column<FaqCol>[] = [
  { key: "question", label: "Question", sortable: false },
  { key: "answer", label: "Answer", sortable: false },
  { key: "status", label: "Status", sortable: false },
  { key: "actions", label: "", sortable: false, align: "right" },
];

function ToggleActiveButton({ faq }: { faq: Faq }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const res = await saveFaqAction({
        publicId: faq.publicId,
        question: faq.question,
        answer: faq.answer,
        active: !faq.active,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(faq.active ? "FAQ deactivated" : "FAQ activated");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      disabled={pending}
      aria-label={faq.active ? `Deactivate ${faq.question}` : `Activate ${faq.question}`}
      onClick={toggle}
    >
      {faq.active ? "Deactivate" : "Activate"}
    </Button>
  );
}

export function FaqTable({ faqs, onEdit }: { faqs: Faq[]; onEdit: (faq: Faq) => void }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={faqs}
      rowKey={(f) => f.publicId}
      serial={false}
      emptyIcon={HelpCircleIcon}
      emptyMessage="No FAQ entries yet. Add one to show it on the public site."
      renderRow={(f) => (
        <>
          <TableCell className="font-medium">{f.question}</TableCell>
          <TableCell className="text-muted-foreground max-w-md truncate">{f.answer}</TableCell>
          <TableCell>
            <Badge variant={f.active ? "default" : "outline"}>{f.active ? "Active" : "Retired"}</Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex items-center justify-end gap-1">
              <ToggleActiveButton faq={f} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                aria-label={`Edit ${f.question}`}
                onClick={() => onEdit(f)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
            </div>
          </TableCell>
        </>
      )}
    />
  );
}
