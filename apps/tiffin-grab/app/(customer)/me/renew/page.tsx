import Link from "next/link";
import { redirect } from "next/navigation";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { currentUserId } from "@/lib/services/session-service";
import { myOrderedMealSizes } from "@/lib/services/customer-deliveries.service";
import { LottieEmptyState } from "@/components/motion";
import { RenewSelector } from "@/components/customer/renew/renew-selector";

export const dynamic = "force-dynamic";

export default function RenewPlanPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Renew your plan</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Pick a meal size you&apos;ve had before, choose your schedule, and pick a start date.
        </p>
      </header>
      <RenewData />
    </main>
  );
}

async function RenewData() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const [ordered, catalog] = await Promise.all([myOrderedMealSizes(userId), loadCatalogSnapshot()]);

  if (ordered.length === 0) {
    return (
      <LottieEmptyState
        animation="empty-box"
        title="You haven't ordered yet"
        body="Once you've started a plan, you'll be able to renew it here in a couple of taps."
        action={
          <Link href="/subscribe" className="bg-primary text-primary-foreground inline-block rounded-md px-4 py-2 text-sm font-medium">
            Browse plans
          </Link>
        }
      />
    );
  }

  const client = toClientCatalog(catalog);
  const orderedByPublicId = new Map(ordered.map((o) => [o.mealSizePublicId, o]));
  const renewableMealSizes = client.mealSizes.filter((m) => orderedByPublicId.has(m.publicId));

  if (renewableMealSizes.length === 0) {
    return (
      <LottieEmptyState
        animation="empty-box"
        title="Those meal sizes aren't available anymore"
        body="The meal size(s) you've ordered before are no longer offered — start a new plan instead."
        action={
          <Link href="/subscribe" className="bg-primary text-primary-foreground inline-block rounded-md px-4 py-2 text-sm font-medium">
            Browse plans
          </Link>
        }
      />
    );
  }

  return <RenewSelector mealSizes={renewableMealSizes} catalog={client} />;
}
