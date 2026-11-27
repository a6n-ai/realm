import { EmptyState } from "../../../components/page/empty-state";
import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { PageHeader } from "../../../components/shell/page-header";
import { Button } from "@foundry/ui/button";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { SearchXIcon } from "lucide-react";
import { InquiryDetail } from "../../../components/inquiries/inquiry-detail";
import { errorText } from "../../../lib/error-copy";
import { getInquiryFn, listOwnersFn } from "../../../lib/inquiries/inquiries.fns";
import { InquiryDetailSkeleton } from "../../../components/page/skeletons";


const crumbs = [{ label: "Inquiries", to: "/inquiries" }, { label: "Inquiry" }];

export const Route = createFileRoute("/_app/inquiries/$id")({
  loader: async ({ params }) => {
    const [inquiry, owners] = await Promise.all([getInquiryFn({ data: { id: params.id } }), listOwnersFn()]);
    return { inquiry, owners: owners ?? [] };
  },
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
  component: InquiryPage,
});

function InquiryPage() {
  const { inquiry, owners } = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  if (!inquiry) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState />
      </>
    );
  }
  if ("missing" in inquiry) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <EmptyState icon={SearchXIcon} title="Inquiry not found" description="It may have been removed, or the link is wrong." action={<Button variant="outline" render={<Link to="/inquiries" />}>Back to inquiries</Button>} />
      </>
    );
  }
  return <InquiryDetail inquiry={inquiry} owners={owners} canAssign={shell.permissions.includes("inquiry:assign")} />;
}
