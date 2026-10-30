import Link from "next/link";
import { Suspense } from "react";
import { ExternalLinkIcon, StarIcon } from "lucide-react";
import { getGoogleReviewsConfig, loadPlacesApiKeyFromEnv, placesProvider, writeReviewUrl } from "@foundry/google-reviews";
import { Skeleton } from "@foundry/ui/skeleton";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader, SectionCard } from "@/components/ds";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { PlaceIdForm } from "./place-id-form";
import { RetryButton } from "./retry-button";

const PUBLIC_SPOTS = [
  { href: "/", label: "Home: rating under the hero and the reviews section" },
  { href: "/reviews", label: "Reviews page" },
  { href: "/plans", label: "Plans" },
  { href: "/pricing", label: "Pricing" },
  { href: "/locations", label: "Locations" },
];

function Stars({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <span className="text-primary flex items-center gap-0.5" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} aria-hidden className={n <= filled ? "size-3.5 fill-current" : "size-3.5 opacity-30"} />
      ))}
    </span>
  );
}

async function ReviewsPreview({ placeId }: { placeId: string }) {
  const summary = await placesProvider.fetchSummary(placeId);
  if (!summary) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Google returned nothing for this listing</AlertTitle>
        <AlertDescription>Check the Place ID and that the Places API is enabled for the server key.</AlertDescription>
        <AlertAction><RetryButton /></AlertAction>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{summary.rating.toFixed(1)}</span>
        <div className="flex flex-col gap-0.5">
          <Stars value={summary.rating} />
          <span className="text-muted-foreground text-xs tabular-nums">{summary.total} reviews on Google</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={writeReviewUrl(placeId)} target="_blank" rel="noreferrer">Review link<ExternalLinkIcon data-icon="inline-end" /></a>
          </Button>
          {summary.attributionUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={summary.attributionUrl} target="_blank" rel="noreferrer">Open listing<ExternalLinkIcon data-icon="inline-end" /></a>
            </Button>
          ) : null}
        </div>
      </div>

      {summary.reviews.length === 0 ? (
        <p className="text-muted-foreground text-sm">Google has a rating for this listing but no written reviews to show yet.</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {summary.reviews.map((r, i) => (
            <li key={`${r.author}-${i}`} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{r.author}</span>
                <Stars value={r.rating} />
                {r.relativeTime ? <span className="text-muted-foreground text-xs">{r.relativeTime}</span> : null}
              </div>
              <p className="text-muted-foreground line-clamp-3 text-sm">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-12" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      {[0, 1, 2].map((n) => (
        <div key={n} className="flex flex-col gap-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export default async function GoogleReviewsSettingsPage() {
  await requireAdmin();
  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);
  const apiKeyConfigured = Boolean(loadPlacesApiKeyFromEnv());
  const placeId = cfg.placeId ?? "";

  return (
    <div className="grid gap-6">
      <PageHeader icon={StarIcon} title="Google Reviews" subtitle="Show your Google rating and reviews on the public site." />

      {!apiKeyConfigured ? (
        <Alert variant="warning">
          <AlertTitle>Places API key missing</AlertTitle>
          <AlertDescription>Set GOOGLE_PLACES_API_KEY on the server. Reviews cannot load until it is set.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Business listing"
          subtitle="The Google Maps listing whose rating and reviews appear on the site."
          action={placeId ? <Badge variant="success-light">Connected</Badge> : <Badge variant="warning-light">Not connected</Badge>}
        >
          <PlaceIdForm placeId={placeId} disabled={!apiKeyConfigured} />
        </SectionCard>

        <SectionCard title="Where reviews show" subtitle="Each spot hides itself until Google returns reviews.">
          <ul className="flex flex-col gap-2">
            {PUBLIC_SPOTS.map((s) => (
              <li key={s.href}>
                <Link href={s.href} target="_blank" className="text-sm underline-offset-4 transition-colors hover:text-primary hover:underline">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="What Google returns" subtitle="Google sends the overall rating and up to 5 reviews it picks. They refresh every 6 hours.">
        {!placeId || !apiKeyConfigured ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">No listing connected yet. Add your Place ID to see the rating and reviews here.</p>
            {apiKeyConfigured ? (
              <Button variant="outline" size="sm" asChild>
                <a href="#place-id">Add a Place ID</a>
              </Button>
            ) : null}
          </div>
        ) : (
          <Suspense fallback={<PreviewSkeleton />}>
            <ReviewsPreview placeId={placeId} />
          </Suspense>
        )}
      </SectionCard>

      <SectionCard
        title="Google Business account"
        subtitle="Sign in with the Google account that manages the listing to see every review and reply from here."
        action={<Badge variant="info-light">Needs Google approval</Badge>}
      >
        <p className="text-muted-foreground text-sm">
          This uses the Google Business Profile API. Google has to approve API access for our project first. Until then, the
          Place ID above covers the rating and the 5 reviews on the site.
        </p>
      </SectionCard>
    </div>
  );
}
