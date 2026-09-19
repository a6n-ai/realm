import type { FacetDef } from "@foundry/design-system";
import { SESSION_CATEGORIES } from "@/db/schema/studio";
import { CATEGORY_LABELS } from "@/lib/sessions/format";
import type { ClassSortColumn, SessionSortColumn } from "@/lib/services/studio-sessions.service";

export const CLASS_SORT_COLUMNS = [
  "title",
  "category",
  "startsAt",
  "capacity",
  "published",
  "createdAt",
] as const satisfies readonly ClassSortColumn[];

export const SESSION_SORT_COLUMNS = [
  "occursOn",
  "title",
  "category",
  "published",
] as const satisfies readonly SessionSortColumn[];

const CATEGORY_OPTIONS = SESSION_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));
const PUBLISHED_OPTIONS = [
  { value: "true", label: "Published" },
  { value: "false", label: "Draft" },
];

export const CLASS_FACETS: FacetDef[] = [
  { kind: "search", fields: ["title", "location", "publicId"] },
  { kind: "pills", field: "category", label: "Category", options: CATEGORY_OPTIONS },
  { kind: "pills", field: "published", label: "Status", options: PUBLISHED_OPTIONS },
];

export const SESSION_FACETS: FacetDef[] = [
  { kind: "search", fields: ["title", "location", "publicId"] },
  { kind: "pills", field: "category", label: "Category", options: CATEGORY_OPTIONS },
  { kind: "pills", field: "published", label: "Status", options: PUBLISHED_OPTIONS },
  { kind: "dateRange", field: "occursOn", label: "Date" },
];
