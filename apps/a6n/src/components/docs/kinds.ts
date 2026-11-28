import type { DocKind } from "../../lib/docs/meta";

export const KIND_LABEL: Record<DocKind, string> = { notes: "Notes", brainstorm: "Brainstorm", client: "Client" };
export const KIND_ORDER = ["notes", "brainstorm", "client"] as const;
