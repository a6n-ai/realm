import { PresenceAvatars } from "@foundry/collab/presence";
import type { CollabEditorProps } from "@foundry/collab/react";
import { meetingTemplate } from "@foundry/collab/template";
import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { Button } from "@foundry/ui/button";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { LockIcon, SearchXIcon } from "lucide-react";
import { useState } from "react";
import { DocEditor } from "../../../components/meeting-docs/doc-editor";
import { DocSettings } from "../../../components/meeting-docs/doc-settings";
import { ShareDialog } from "../../../components/meeting-docs/share-dialog";
import { EmptyState } from "../../../components/page/empty-state";
import { InquiryDetailSkeleton } from "../../../components/page/skeletons";
import { PageHeader } from "../../../components/shell/page-header";
import { errorText } from "../../../lib/error-copy";
import { getMeetingDocFn, staffRoomTokenFn } from "../../../lib/meeting-docs/meeting-docs.fns";

const crumbs = [{ label: "Inquiries", to: "/inquiries" }, { label: "Meeting doc" }];

export const Route = createFileRoute("/_app/inquiries/$id_/docs/$docId")({
  loader: ({ params }) => getMeetingDocFn({ data: { docId: params.docId } }),
  pendingComponent: InquiryDetailSkeleton,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />
      </>
    );
  },
  component: MeetingDocPage,
});

function MeetingDocPage() {
  const data = Route.useLoaderData();
  const { id } = Route.useParams();
  if (!data) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState />
      </>
    );
  }
  if ("missing" in data || data.doc.inquiryId !== id) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <EmptyState icon={SearchXIcon} title="Doc not found" description="It may have been removed, or the link is wrong." action={<Button variant="outline" render={<Link to="/inquiries" />}>Back to inquiries</Button>} />
      </>
    );
  }
  return <MeetingDoc key={data.doc.id} {...data} />;
}

type Loaded = Extract<NonNullable<ReturnType<typeof Route.useLoaderData>>, { doc: unknown }>;

function MeetingDoc({ doc, shares, canEdit, canShare, viewer }: Loaded) {
  const [provider, setProvider] = useState<Parameters<NonNullable<CollabEditorProps["onProvider"]>>[0]>(null);
  const [denied, setDenied] = useState(false);
  // fixed at first load: a refresh after saving must not swap what the editor was seeded with
  const [template] = useState(() =>
    doc.hasContent || !canEdit
      ? undefined
      : meetingTemplate({ title: doc.title, attendees: [doc.contactName, viewer.name].filter((n): n is string => Boolean(n)) }),
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inquiries", to: "/inquiries" }, { label: doc.contactName ?? "Inquiry", to: `/inquiries/${doc.inquiryId}` }, { label: doc.title }]}
        actions={
          <>
            {provider ? <PresenceAvatars provider={provider} /> : null}
            {canShare ? (
              <>
                <DocSettings docId={doc.id} seconds={doc.defaultLinkTtlSeconds} />
                <ShareDialog docId={doc.id} defaultSeconds={doc.defaultLinkTtlSeconds} shares={shares} />
              </>
            ) : null}
          </>
        }
      />
      <div className="px-4 pb-8">
        {denied ? (
          <EmptyState icon={LockIcon} title="You no longer have access to this doc" />
        ) : (
          <DocEditor
            docId={doc.id}
            user={{ sub: viewer.userId, name: viewer.name }}
            readOnly={!canEdit}
            template={template}
            getToken={async () => {
              const res = await staffRoomTokenFn({ data: { docId: doc.id } });
              return res?.ok ? res.token : null;
            }}
            onDenied={() => setDenied(true)}
            onProvider={setProvider}
          />
        )}
      </div>
    </>
  );
}
