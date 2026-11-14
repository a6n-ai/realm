import type { Visible } from "@/lib/tenant/org-scope";


export type AnalyticsScope = {
  orgIds: Visible;
  /** Every franchise the viewer may see; drill links omit `org` when the scope already covers all of them. */
  visible: Visible;
  fromMs: number;
  toMs: number;
  tz: string;
  plans: string[];
  mealSizes: string[];
  zones: string[];
  /** Tab-only params (method, complaint category/subcategory/status/priority) carried through drill links. */
  extra: Record<string, string[]>;
};
