import { useRouteContext } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useState } from "react";
import { listActiveSourcesFn } from "../../lib/inquiries/inquiries.fns";
import type { SourceRow, SubsourceRow } from "../../lib/inquiries/sources";
import { NewInquiryDialog } from "../inquiries/new-inquiry-dialog";
import { SourceDialog } from "../sources/source-dialog";
import { InviteDialog } from "../team/invite-dialog";
import type { CreateKind } from "../nav";

const CreateContext = createContext<(kind: CreateKind) => void>(() => {});

export const useCreate = () => useContext(CreateContext);

// The Create New menu, Find and the empty states open the same three dialogs, mounted once here.
export function CreateProvider({ children }: { children: ReactNode }) {
  const { shell } = useRouteContext({ from: "/_app" });
  const [open, setOpen] = useState<CreateKind | null>(null);
  const [sources, setSources] = useState<{ sources: SourceRow[]; subsources: SubsourceRow[] }>({ sources: [], subsources: [] });
  const close = (next: boolean) => {
    if (!next) setOpen(null);
  };
  const start = (kind: CreateKind) => {
    setOpen(kind);
    if (kind === "inquiry") void listActiveSourcesFn().then((s) => s && setSources(s), () => {});
  };
  return (
    <CreateContext.Provider value={start}>
      {children}
      <NewInquiryDialog open={open === "inquiry"} onOpenChange={close} sources={sources.sources} subsources={sources.subsources} />
      <InviteDialog open={open === "invite"} onOpenChange={close} roles={shell.grantableRoles} />
      <SourceDialog mode={{ kind: "create" }} open={open === "source"} onOpenChange={close} />
    </CreateContext.Provider>
  );
}
