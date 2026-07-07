export type Option = { value: string; label: string; count?: number; parent?: string };

export type FacetDef =
  | { kind: "pills"; field: string; label: string; options: Option[] }
  | { kind: "select"; field: string; label: string; options: Option[] }
  | { kind: "multi"; field: string; label: string; options: Option[]; dependsOn?: string }
  | { kind: "dateRange"; field: string; label: string }
  | { kind: "search"; fields: string[] };
