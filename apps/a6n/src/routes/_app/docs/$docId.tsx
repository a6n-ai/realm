import { PresenceAvatars } from "@foundry/collab/presence";
import type { CollabEditorProps } from "@foundry/collab/react";
import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { runAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { LockIcon, SearchXIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { DocTitle } from "../../../components/docs/doc-title";
import { PeopleSection } from "../../../components/docs/people-section";
import { ownDocLinks } from "../../../components/docs/share-from-list";
import { DocEditor } from "../../../components/meeting-docs/doc-editor";
import { DocSettings } from "../../../components/meeting-docs/doc-settings";
import { ShareDialog } from "../../../components/meeting-docs/share-dialog";
import { DOC_VIEWPORT } from "../../../components/meeting-docs/viewport";
import { EmptyState } from "../../../components/page/empty-state";
import { DocPageSkeleton } from "../../../components/page/skeletons";
import { PageHeader } from "../../../components/shell/page-header";
import { getDocFn, setDocDefaultTtlFn, trashDocFn } from "../../../lib/docs/docs.fns";
import { errorText } from "../../../lib/error-copy";
import { staffRoomTokenFn } from "../../../lib/meeting-docs/meeting-docs.fns";

const crumbs = [{ label: "Docs", to: "/docs" }, { label: "Doc" }];

export const Route = createFileRoute("/_app/docs/$docId")({
  head: () => ({ meta: [{ name: "viewport", content: DOC_VIEWPORT }] }),
  loader: ({ params }) => getDocFn({ data: { docId: params.docId } }),
  pendingComponent: DocPageSkeleton,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />
      </>
    );
  },
  component: DocPage,
});

function DocPage() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState />
      </>
    );
  }
  if ("missing" in data) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <EmptyState icon={SearchXIcon} title="Doc not found" description="It may have been removed, or it is not shared with you." action={<Button variant="outline" render={<Link to="/docs" />}>Back to docs</Button>} />
      </>
    );
  }
  return <Doc key={data.doc.id} {...data} />;
}

type Loaded = Extract<NonNullable<ReturnType<typeof Route.useLoaderData>>, { doc: unknown }>;

function Doc({ doc, viewer, members, shares }: Loaded) {
  const router = useRouter();
  const navigate = useNavigate();
  const [provider, setProvider] = useState<Parameters<NonNullable<CollabEditorProps["onProvider"]>>[0]>(null);
  const [denied, setDenied] = useState(false);
  const owner = doc.access === "owner";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Docs", to: "/docs" }, { label: doc.title }]}
        heading={owner && !denied ? <DocTitle docId={doc.id} title={doc.title} /> : undefined}
        description={owner ? undefined : `Shared by ${doc.ownerName ?? "someone"}`}
        actions={
          <>
            {provider ? <PresenceAvatars provider={provider} /> : null}
            {owner ? (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Move to Trash"
                  onClick={() => void runAction(() => trashDocFn({ data: { docId: doc.id } }), "Moved to Trash", () => navigate({ to: "/docs" }), errorText)}
                >
                  <Trash2Icon aria-hidden className="size-4" />
                </Button>
                <DocSettings seconds={doc.defaultLinkTtlSeconds} onSave={(seconds) => setDocDefaultTtlFn({ data: { docId: doc.id, seconds } })} />
                <ShareDialog
                  docId={doc.id}
                  defaultSeconds={doc.defaultLinkTtlSeconds}
                  shares={shares}
                  actions={ownDocLinks}
                  people={members ? <PeopleSection docId={doc.id} {...members} /> : null}
                />
              </>
            ) : null}
          </>
        }
      />
      <div className="grid gap-3 px-4 pb-8">
        {denied ? (
          <EmptyState icon={LockIcon} title="You no longer have access to this doc" />
        ) : (
          <DocEditor
            docId={doc.id}
            user={{ sub: viewer.userId, name: viewer.name }}
            readOnly={doc.access === "view"}
            getToken={async () => {
              const res = await staffRoomTokenFn({ data: { docId: doc.id } });
              if (!res?.ok) return null;
              // access changed while the doc was open: reload so the editor matches it
              if (res.canEdit !== (doc.access !== "view")) await router.invalidate();
              return res.token;
            }}
            onDenied={() => setDenied(true)}
            onProvider={setProvider}
          />
        )}
      </div>
    </>
  );
}
