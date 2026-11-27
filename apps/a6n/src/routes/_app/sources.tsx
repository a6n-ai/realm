import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { ListSkeleton } from "@foundry/console/list-skeleton";
import { PageHeader } from "@foundry/console/page-header";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { SourceDialog } from "../../components/sources/source-dialog";
import { SourcesTable } from "../../components/sources/sources-table";
import { errorText } from "../../lib/error-copy";
import { listSourcesFn } from "../../lib/inquiries/sources.fns";

export const Route = createFileRoute("/_app/sources")({
  loader: () => listSourcesFn(),
  pendingComponent: () => (
    <>
      <PageHeader crumbs={[{ label: "Sources" }]} />
      <ListSkeleton />
    </>
  ),
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <>
        <PageHeader crumbs={[{ label: "Sources" }]} />
        <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />
      </>
    );
  },
  component: SourcesPage,
});

function SourcesPage() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Sources" }]} />
        <DeniedState />
      </>
    );
  }
  return (
    <>
      <PageHeader crumbs={[{ label: "Sources" }]} actions={<SourceDialog mode={{ kind: "create" }} />} />
      <SourcesTable sources={data.sources} subsources={data.subsources} />
    </>
  );
}
