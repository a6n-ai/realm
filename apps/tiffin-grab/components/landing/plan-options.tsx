import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Plans shown but not sold yet. Keyed here rather than on plans.active, because
// active=false drops the row from loadCatalogSnapshot entirely; the point is to
// advertise it. Remove the key to open the plan.
const COMING_SOON = new Set(["healthy"]);

type Plan = { key: string; name: string; description: string | null; planType: string };

export const publicPlans = <P extends Plan>(plans: P[]) => plans.filter((p) => p.planType === "tiffin" || COMING_SOON.has(p.key));
export const isComingSoon = (key: string) => COMING_SOON.has(key);

// The kit's option cards: a sellable plan links into the wizard with it picked.
