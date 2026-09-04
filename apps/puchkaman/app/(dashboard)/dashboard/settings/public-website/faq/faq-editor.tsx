"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import type { Faq } from "@/lib/services/faqs.service";
import { FaqEditDialog } from "./faq-edit-dialog";
import { FaqTable } from "./faq-table";

/** Blank row that puts the dialog into create mode. */
const NEW_FAQ: Faq = { publicId: "", question: "", answer: "", sortOrder: 0, active: true };

export function FaqEditor({ faqs }: { faqs: Faq[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Faq | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => setEditing(NEW_FAQ)}>
          <PlusIcon className="mr-1.5 size-4" />
          Add FAQ
        </Button>
      </div>
      <FaqTable faqs={faqs} onEdit={setEditing} />
      <FaqEditDialog faq={editing} onOpenChange={(open) => !open && setEditing(null)} onSaved={() => router.refresh()} />
    </div>
  );
}
