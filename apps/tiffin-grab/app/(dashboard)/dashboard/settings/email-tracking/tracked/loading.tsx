import { Skeleton } from "@foundry/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Turn on the emails that should also record opens and clicks. Applies to emails sent from now on.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}
