import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import type { getDocFn } from "../../lib/docs/docs.fns";
import { createDocShareFn, revokeDocShareFn, setDocShareExpiryFn } from "../../lib/docs/docs.fns";
import { createShareFn, revokeShareFn, setShareExpiryFn, type getMeetingDocFn } from "../../lib/meeting-docs/meeting-docs.fns";
import { ShareDialog, type ShareActions } from "../meeting-docs/share-dialog";
import { PeopleSection } from "./people-section";

export const ownDocLinks: ShareActions = {
  create: (data) => createDocShareFn({ data }),
  setExpiry: (data) => setDocShareExpiryFn({ data }),
  revoke: (data) => revokeDocShareFn({ data }),
};
const inquiryDocLinks: ShareActions = {
  create: (data) => createShareFn({ data }),
  setExpiry: (data) => setShareExpiryFn({ data }),
  revoke: (data) => revokeShareFn({ data }),
};

export type Sharing =
  | { source: "mine"; data: Awaited<ReturnType<typeof getDocFn>> }
  | { source: "inquiry"; data: Awaited<ReturnType<typeof getMeetingDocFn>> };

/** The share dialog for the doc named in `?share=`, loaded by the list's route. */
export function ShareFromList({ sharing }: { sharing: Sharing }) {
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ from: "/_app/docs/" });
  const close = (open: boolean) => {
    if (!open) void navigate({ to: "/docs", search: { ...search, share: undefined } }).then(() => router.invalidate());
  };
  const { data } = sharing;
  if (!data || "missing" in data) return null;
  const members = "members" in data ? data.members : null;
  return (
    <ShareDialog
      key={data.doc.id}
      open
      onOpenChange={close}
      docId={data.doc.id}
      defaultSeconds={data.doc.defaultLinkTtlSeconds}
      shares={data.shares}
      actions={sharing.source === "mine" ? ownDocLinks : inquiryDocLinks}
      people={members ? <PeopleSection docId={data.doc.id} {...members} /> : null}
    />
  );
}
