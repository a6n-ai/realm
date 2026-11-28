import { Badge } from "@foundry/ui/badge";
import { Link } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";
import type { LibraryItem } from "../../lib/docs/library";
import { LINK } from "../link-class";
import { RelativeTime } from "../relative-time";
import { DocRowActions } from "./row-actions";
import { KIND_LABEL } from "./kinds";

function sharing(d: LibraryItem): string {
  if (d.source === "shared") return d.access === "edit" ? "Can edit" : "Read only";
  const parts = [d.sharedWith ? `Shared with ${d.sharedWith}` : "", d.activeLinks ? `${d.activeLinks} ${d.activeLinks === 1 ? "link" : "links"}` : ""];
  return parts.filter(Boolean).join(" · ") || (d.source === "mine" ? "Private" : "");
}

function Title({ doc }: { doc: LibraryItem }) {
  const className = `truncate font-medium ${LINK}`;
  if (doc.trashed) return <span className="truncate font-medium">{doc.title}</span>;
  return doc.inquiryId ? (
    <Link to="/inquiries/$id/docs/$docId" params={{ id: doc.inquiryId, docId: doc.id }} className={className}>
      {doc.title}
    </Link>
  ) : (
    <Link to="/docs/$docId" params={{ docId: doc.id }} className={className}>
      {doc.title}
    </Link>
  );
}

export function DocList({ docs }: { docs: LibraryItem[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 p-3">
          <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <div className="grid min-w-0 flex-1 gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <Title doc={d} />
              <Badge variant="secondary">{KIND_LABEL[d.kind]}</Badge>
            </div>
            <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{d.ownerName ?? "Someone"}</span>
              <RelativeTime at={d.updatedAt} />
              <span>{sharing(d)}</span>
              {d.inquiryId && !d.trashed ? (
                <Link to="/inquiries/$id" params={{ id: d.inquiryId }} className={LINK}>
                  Inquiry
                </Link>
              ) : null}
            </span>
          </div>
          <DocRowActions doc={d} />
        </li>
      ))}
    </ul>
  );
}
