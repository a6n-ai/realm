import { PageSkeleton } from "@/components/ds";

// Single build-time skeleton for every dashboard route. Next.js applies the
// nearest loading.tsx as each route's Suspense fallback at build — this one file
// covers all of them. A route that wants a tailored shape drops its own
// loading.tsx: `export { default } from "..."` or `<PageSkeleton variant="form" />`.
export default function Loading() {
  return <PageSkeleton filters={4} />;
}
