"use client";

import { Breadcrumbs } from "@realm/design-system";
import { labelForSegment } from "@/components/ds/route-labels";

// Breadcrumbs is a client component; the function prop can't cross the
// server→client boundary. Bind labelForSegment here, client-to-client.
export function AppBreadcrumbs() {
  return <Breadcrumbs resolveLabel={labelForSegment} />;
}
