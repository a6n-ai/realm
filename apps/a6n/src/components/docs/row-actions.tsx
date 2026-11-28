import { ConfirmDialog } from "@foundry/console/confirm-dialog";
import { confirmAction, runAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import { Input } from "@foundry/ui/input";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { MoreHorizontalIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { deleteDocFn, duplicateDocFn, renameDocFn, restoreDocFn, setDocKindFn, trashDocFn } from "../../lib/docs/docs.fns";
import type { LibraryItem } from "../../lib/docs/library";
import type { DocKind } from "../../lib/docs/meta";
import { errorText } from "../../lib/error-copy";
import { ResponsiveDialog } from "../responsive-dialog";
import { KIND_LABEL, KIND_ORDER } from "./kinds";

function RenameForm({ doc, onDone }: { doc: LibraryItem; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  function submit(e: FormEvent) {
    e.preventDefault();
    void runAction(() => renameDocFn({ data: { docId: doc.id, title } }), "Title saved", async () => {
      onDone();
      await router.invalidate();
    }, errorText);
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Input aria-label="Doc title" autoFocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Button type="submit" className="justify-self-end" disabled={!title.trim()}>
        Save
      </Button>
    </form>
  );
}

/** One row's menu. It offers only what the server said this actor may do. */
export function DocRowActions({ doc }: { doc: LibraryItem }) {
  const router = useRouter();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_app/docs/" });
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { can } = doc;
  const refresh = () => router.invalidate();
  const data = { docId: doc.id };
  // a trashed doc is not opened, and without other rights there is no menu to show
  if (doc.trashed && !can.restore && !can.deleteForever) return null;

  const open = () =>
    void (doc.inquiryId
      ? navigate({ to: "/inquiries/$id/docs/$docId", params: { id: doc.inquiryId, docId: doc.id } })
      : navigate({ to: "/docs/$docId", params: { docId: doc.id } }));

  return (
    <>
      <DropdownMenu open={menu} onOpenChange={setMenu}>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${doc.title}`} />}>
          <MoreHorizontalIcon aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {doc.trashed ? null : <DropdownMenuItem onClick={open}>Open</DropdownMenuItem>}
          {can.rename ? <DropdownMenuItem onClick={() => setRenaming(true)}>Rename</DropdownMenuItem> : null}
          {can.share ? (
            <DropdownMenuItem onClick={() => void navigate({ to: "/docs", search: { ...search, share: doc.id } })}>Share</DropdownMenuItem>
          ) : null}
          {can.duplicate ? (
            <DropdownMenuItem onClick={() => void runAction(() => duplicateDocFn({ data }), "Doc duplicated", refresh, errorText)}>
              Duplicate
            </DropdownMenuItem>
          ) : null}
          {can.setKind ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Type</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={doc.kind}
                  onValueChange={(v) => {
                    // a radio item leaves the menu open
                    setMenu(false);
                    if (v !== doc.kind) void runAction(() => setDocKindFn({ data: { ...data, kind: v as DocKind } }), "Type changed", refresh, errorText);
                  }}
                >
                  {KIND_ORDER.map((kind) => (
                    <DropdownMenuRadioItem key={kind} value={kind}>
                      {KIND_LABEL[kind]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </>
          ) : null}
          {can.trash ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void runAction(() => trashDocFn({ data }), "Moved to Trash", refresh, errorText)}>
                Move to Trash
              </DropdownMenuItem>
            </>
          ) : null}
          {can.restore ? (
            <DropdownMenuItem onClick={() => void runAction(() => restoreDocFn({ data }), "Doc restored", refresh, errorText)}>Restore</DropdownMenuItem>
          ) : null}
          {can.deleteForever ? <DropdownMenuItem onClick={() => setDeleting(true)}>Delete forever</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResponsiveDialog open={renaming} onOpenChange={setRenaming} title="Rename doc">
        {renaming ? <RenameForm doc={doc} onDone={() => setRenaming(false)} /> : null}
      </ResponsiveDialog>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this doc forever?"
        description={`"${doc.title}" disappears from a6n for everyone. You cannot bring it back here.`}
        confirmLabel="Delete forever"
        onConfirm={async () => {
          await confirmAction(() => deleteDocFn({ data }), "Doc deleted", refresh, errorText);
          setDeleting(false);
        }}
      />
    </>
  );
}
