import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { DocList } from "../../../components/docs/doc-list";
import { TAB_LINK } from "../../../components/link-class";
import { EmptyState } from "../../../components/page/empty-state";
import { DocsSkeleton } from "../../../components/page/skeletons";
import { PageHeader } from "../../../components/shell/page-header";
import { createDocFn, listDocsFn } from "../../../lib/docs/docs.fns";
import { errorText } from "../../../lib/error-copy";

const crumbs = [{ label: "Docs" }];

export const Route = createFileRoute("/_app/docs/")({
  validateSearch: (search: Record<string, unknown>): { tab?: "shared" } => (search.tab === "shared" ? { tab: "shared" } : {}),
  loader: () => listDocsFn(),
  pendingComponent: DocsSkeleton,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <>
        <PageHeader title="Docs" crumbs={crumbs} />
        <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />
      </>
    );
  },
  component: DocsPage,
});

function DocsPage() {
  const data = Route.useLoaderData();
  const shared = Route.useSearch().tab === "shared";
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const res = await createDocFn({ data: {} });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      await navigate({ to: "/docs/$docId", params: { docId: res.id } });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setCreating(false);
    }
  }

  const newDoc = (
    <Button disabled={creating} onClick={() => void create()}>
      <PlusIcon aria-hidden className="size-4" />
      New doc
    </Button>
  );
  const docs = data ? (shared ? data.shared : data.mine) : [];

  return (
    <>
      <PageHeader title="Docs" crumbs={crumbs} description="Notes and ideas. A doc is private until you share it." actions={data ? newDoc : undefined} />
      {data ? (
        <div className="grid gap-3 px-4 pb-8">
          <nav aria-label="Docs" className="flex gap-1">
            <Link to="/docs" search={{}} data-active={!shared} aria-current={shared ? undefined : "page"} className={TAB_LINK}>
              My docs
            </Link>
            <Link to="/docs" search={{ tab: "shared" }} data-active={shared} aria-current={shared ? "page" : undefined} className={TAB_LINK}>
              Shared with me
            </Link>
          </nav>
          {docs.length ? (
            <DocList docs={docs} />
          ) : shared ? (
            <EmptyState icon={FileTextIcon} title="Nothing shared with you yet" />
          ) : (
            <EmptyState icon={FileTextIcon} title="No docs yet" action={newDoc} />
          )}
        </div>
      ) : (
        <DeniedState />
      )}
    </>
  );
}
