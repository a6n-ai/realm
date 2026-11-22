import { StarIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { FieldsSkeleton, SettingsPageFrame } from "../_skeletons";

export default function Loading() {
  return (
    <SettingsPageFrame icon={StarIcon} title="Google Reviews" subtitle="Show your Google rating and reviews on the public site.">
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Business listing" subtitle="The Google Maps listing whose rating and reviews appear on the site.">
          <FieldsSkeleton fields={1} />
        </SectionCard>
        <SectionCard title="Where reviews show" subtitle="Each spot hides itself until Google returns reviews.">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        </SectionCard>
      </div>
      <SectionCard title="What Google returns" subtitle="Google sends the overall rating and up to 5 reviews it picks. They refresh at most once a day; Save and test pulls them now.">
        <Skeleton className="h-40 w-full" />
      </SectionCard>
      <SectionCard title="Google Business account" subtitle="Sign in with the Google account that manages the listing to see every review and reply from here.">
        <Skeleton className="h-10 w-full" />
      </SectionCard>
    </SettingsPageFrame>
  );
}
