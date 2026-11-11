"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, MessageSquarePlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { NoteDialog } from "./_leads/status-dialog";

export function NextLeadNoteButton({ inquiryId, timeZone }: { inquiryId: string; timeZone: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="text-violet-600 dark:text-violet-400" onClick={() => setOpen(true)}>
        <MessageSquarePlusIcon className="size-4" />
        Add note
      </Button>
      {open && <NoteDialog inquiryId={inquiryId} timeZone={timeZone} kind="note" open onOpenChange={setOpen} />}
    </>
  );
}

export function NextLeadOwnerPicker({ label, options }: { label: string; options: { value: string; label: string; href: string }[] }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
          <ChevronDownIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => router.push(o.href)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
