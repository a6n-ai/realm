import { PresenceAvatars } from "@foundry/collab/presence";
import type { CollabEditorProps } from "@foundry/collab/react";
import { ErrorState } from "@foundry/console/error-state";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { sessionStore } from "@foundry/ui/safe-storage";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { DocEditor } from "../components/meeting-docs/doc-editor";
import { DOC_VIEWPORT } from "../components/meeting-docs/viewport";
import { errorText } from "../lib/error-copy";
import { guestRoomTokenFn, openShareFn } from "../lib/meeting-docs/meeting-docs.fns";
import type { ShareView } from "../lib/meeting-docs/share-link";

const REFUSALS = {
  expired: "This link has expired",
  unavailable: "This link is no longer available",
  invalid: "This link is no longer available",
  rate_limited: "Too many attempts. Try again in a few minutes.",
} as const;

export const Route = createFileRoute("/m/$token")({
  head: () => ({
    meta: [
      { title: "Shared doc · a6n" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
      { name: "viewport", content: DOC_VIEWPORT },
    ],
  }),
  loader: ({ params }) => openShareFn({ data: { token: params.token } }),
  errorComponent: ({ error }) => {
    const router = useRouter();
    return <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />;
  },
  component: GuestPage,
});

function Refusal({ text }: { text: string }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <h1 className="text-center text-lg font-semibold">{text}</h1>
    </main>
  );
}

function GuestPage() {
  const share = Route.useLoaderData();
  const { token } = Route.useParams();
  if (share.status !== "ok") return <Refusal text={REFUSALS[share.status]} />;
  return <GuestDoc key={share.shareId} token={token} share={share} />;
}

function NameForm({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed) onJoin(trimmed);
  }
  return (
    <form onSubmit={submit} className="mx-auto grid w-full max-w-sm gap-3 pt-10">
      <Label htmlFor="guest-name">Your name</Label>
      <Input id="guest-name" autoFocus required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" disabled={!trimmed}>
        Join
      </Button>
    </form>
  );
}

function GuestDoc({ token, share }: { token: string; share: Extract<ShareView, { status: "ok" }> }) {
  const key = `collab:name:${share.shareId}`;
  const [name, setName] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<keyof typeof REFUSALS | null>(null);
  const [provider, setProvider] = useState<Parameters<NonNullable<CollabEditorProps["onProvider"]>>[0]>(null);
  // storage is read after mount, so the server and the first client render agree
  useEffect(() => setName(sessionStore.get(key)), [key]);

  if (refusal) return <Refusal text={REFUSALS[refusal]} />;

  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="grid min-w-0">
          <span className="text-sm font-semibold">{share.orgName}</span>
          <span className="text-xs text-muted-foreground">Shared by {share.sharedBy ?? share.orgName}</span>
        </div>
        {provider ? <PresenceAvatars provider={provider} /> : null}
      </header>
      <main className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{share.title}</h1>
        {name ? (
          <DocEditor
            docId={share.docId}
            user={{ sub: `guest:${share.shareId}:${name.toLowerCase()}`, name }}
            readOnly={share.mode === "view"}
            getToken={async () => {
              const res = await guestRoomTokenFn({ data: { token, name } });
              if (res.ok) return res.token;
              setRefusal(res.code);
              return null;
            }}
            onProvider={setProvider}
          />
        ) : (
          <NameForm
            onJoin={(next) => {
              sessionStore.set(key, next);
              setName(next);
            }}
          />
        )}
      </main>
    </div>
  );
}
