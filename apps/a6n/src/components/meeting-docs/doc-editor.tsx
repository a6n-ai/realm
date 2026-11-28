import { colorFor } from "@foundry/collab/colors";
import type { CollabEditorProps, CollabStatus } from "@foundry/collab/react";
import { Skeleton } from "@foundry/ui/skeleton";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { useDark } from "./use-dark";

// BlockNote loads only on a doc page, and never during SSR.
const CollabEditor = lazy(() => import("@foundry/collab/react").then((m) => ({ default: m.CollabEditor })));

const STATUS_TEXT: Record<CollabStatus, string> = {
  connecting: "Connecting…",
  connected: "Live",
  disconnected: "Offline, retrying",
  full: "That change is too large to save. Reload the page to keep editing.",
};

export type DocEditorProps = Pick<CollabEditorProps, "docId" | "getToken" | "readOnly" | "template" | "onDenied" | "onProvider"> & {
  /** `sub` picks the cursor colour; `name` labels the cursor. */
  user: { sub: string; name: string };
};

const loading = (
  <div role="status" className="grid gap-3 p-4">
    <span className="sr-only">Loading…</span>
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-4 w-3/5" />
  </div>
);

function Live({ user, ...props }: DocEditorProps) {
  const dark = useDark();
  const [status, setStatus] = useState<CollabStatus>("connecting");
  return (
    <div className="grid gap-2">
      <p role="status" className="text-xs text-muted-foreground">
        {STATUS_TEXT[status]}
        {props.readOnly ? " · Read only" : ""}
      </p>
      <div className="meeting-doc min-h-96 rounded-lg border py-4">
        <Suspense fallback={loading}>
          <CollabEditor
            {...props}
            url={window.location.host}
            user={{ name: user.name, color: colorFor(user.sub) }}
            theme={dark ? "dark" : "light"}
            // "full" is final: a reconnect must not hide it
            onStatus={(next) => setStatus((now) => (now === "full" ? now : next))}
          />
        </Suspense>
      </div>
    </div>
  );
}

export function DocEditor(props: DocEditorProps) {
  return (
    <ClientOnly fallback={loading}>
      <Live {...props} />
    </ClientOnly>
  );
}
