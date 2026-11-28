import { Link } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";
import type { DocListItem } from "../../lib/docs/service";
import { LINK } from "../link-class";
import { RelativeTime } from "../relative-time";

function sharing(d: DocListItem): string {
  if (!d.sharedWith && !d.activeLinks) return "Private";
  return [d.sharedWith ? `Shared with ${d.sharedWith}` : "", d.activeLinks ? `${d.activeLinks} ${d.activeLinks === 1 ? "link" : "links"}` : ""]
    .filter(Boolean)
    .join(" · ");
}

export function DocList({ docs }: { docs: DocListItem[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 p-3">
          <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <div className="grid min-w-0">
            <Link to="/docs/$docId" params={{ docId: d.id }} className={`truncate font-medium ${LINK}`}>
              {d.title}
            </Link>
            <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{d.ownerName ?? "Someone"}</span>
              <RelativeTime at={d.updatedAt} />
              <span>{d.access === "owner" ? sharing(d) : d.access === "edit" ? "Can edit" : "Read only"}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
