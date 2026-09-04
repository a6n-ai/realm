"use client";

import { HelpCircleIcon, PencilIcon } from "lucide-react";
import { DataTable, type Column } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import type { Faq } from "@/lib/services/faqs.service";

type FaqCol = "question" | "answer" | "status" | "actions";

const COLUMNS: readonly Column<FaqCol>[] = [
  { key: "question", label: "Question", sortable: false },
  { key: "answer", label: "Answer", sortable: false },
  { key: "status", label: "Status", sortable: false },
  { key: "actions", label: "", sortable: false, align: "right" },
];

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
          </TableCell>
        </>
      )}
    />
  );
}
