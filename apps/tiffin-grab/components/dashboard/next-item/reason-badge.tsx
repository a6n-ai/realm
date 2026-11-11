import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/reui/badge";

/** Why a Next card's item is in the queue; the adapter picks the variant, the text is its own. */
export function ReasonBadge({ variant, children }: { variant: ComponentProps<typeof Badge>["variant"]; children: ReactNode }) {
  return <Badge variant={variant}>{children}</Badge>;
}
