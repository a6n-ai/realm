export type AnalyticsScope = {
  orgIds: "all" | string[];
  /** Every franchise the viewer may see; drill links omit `org` when the scope already covers all of them. */
  visible: "all" | string[];
  fromMs: number;
  toMs: number;
  tz: string;
  plans: string[];
  mealSizes: string[];
  zones: string[];
  /** Tab-only params (method, complaint category/subcategory/status/priority) carried through drill links. */
  extra: Record<string, string[]>;
};
