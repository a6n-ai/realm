import { ConfirmDialog } from "@foundry/console/confirm-dialog";
import { confirmAction, runAction } from "@foundry/console/run-action";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { CopyIcon, Share2Icon } from "lucide-react";
import { useState } from "react";
import { errorText } from "../../lib/error-copy";
import { createShareFn, revokeShareFn, setShareExpiryFn } from "../../lib/meeting-docs/meeting-docs.fns";
import type { ShareRow } from "../../lib/meeting-docs/service";
import { LocalTime } from "../local-time";
import { ResponsiveDialog } from "../responsive-dialog";
import { expiryFrom, type ExpiryChoice } from "./expiry";
import { ExpirySelect } from "./expiry-select";

const MODE_LABEL = { edit: "Can edit", view: "Read only" } as const;

function ShareItem({ share, defaultSeconds }: { share: ShareRow; defaultSeconds: number }) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [choice, setChoice] = useState<ExpiryChoice>({ preset: defaultSeconds });
  const [confirming, setConfirming] = useState(false);
  const revoked = share.revokedAt !== null;
  const expired = !revoked && share.expiresAt <= Date.now();

  const save = () =>
    runAction(
      () => setShareExpiryFn({ data: { shareId: share.id, expiresAt: expiryFrom(choice, Date.now()) } }),
      "Expiry changed",
      async () => {
        setChanging(false);
        await router.invalidate();
      },
      errorText,
    );

  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid">
          <span className="flex items-center gap-2 text-sm font-medium">
            {MODE_LABEL[share.mode]}
            {revoked ? <Badge variant="destructive">Revoked</Badge> : null}
            {expired ? <Badge variant="secondary">Expired</Badge> : null}
          </span>
          <span className="text-xs text-muted-foreground">
            Expires <LocalTime at={share.expiresAt} time />
            {share.createdByName ? ` · by ${share.createdByName}` : ""}
          </span>
        </div>
        {revoked ? null : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" aria-expanded={changing} onClick={() => setChanging((v) => !v)}>
              Change expiry
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              Revoke
            </Button>
          </div>
        )}
      </div>
      {changing ? (
        <div className="flex flex-wrap items-center gap-2">
          <ExpirySelect value={choice} onChange={setChoice} />
          <Button size="sm" disabled={"date" in choice && !choice.date} onClick={() => void save()}>
            Save
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Revoke this link?"
        description="Revoke this link? Anyone using it is disconnected now."
        confirmLabel="Revoke link"
        onConfirm={async () => {
          await confirmAction(() => revokeShareFn({ data: { shareId: share.id } }), "Link revoked", () => router.invalidate(), errorText);
          setConfirming(false);
        }}
      />
    </li>
  );
}

export function ShareDialog({ docId, defaultSeconds, shares }: { docId: string; defaultSeconds: number; shares: ShareRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"edit" | "view">("edit");
  const [choice, setChoice] = useState<ExpiryChoice>({ preset: defaultSeconds });
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    try {
      const res = await createShareFn({ data: { docId, mode, expiresAt: expiryFrom(choice, Date.now()) } });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      setUrl(res.url);
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setUrl(null);
          setChoice({ preset: defaultSeconds });
          setOpen(true);
        }}
      >
        <Share2Icon aria-hidden className="size-4" />
        Share
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Share this doc" description="Anyone with a link can join by typing their name.">
        <div className="grid max-h-[70dvh] gap-5 overflow-y-auto p-px">
          <div className="grid gap-3">
            <RadioGroup aria-label="Access" value={mode} onValueChange={(v) => setMode(v === "view" ? "view" : "edit")} className="flex gap-4">
              {(["edit", "view"] as const).map((m) => (
                <Label key={m} className="flex items-center gap-2">
                  <RadioGroupItem value={m} />
                  {MODE_LABEL[m]}
                </Label>
              ))}
            </RadioGroup>
            <ExpirySelect value={choice} onChange={setChoice} />
            <Button className="justify-self-start" disabled={pending || ("date" in choice && !choice.date)} onClick={() => void create()}>
              Create link
            </Button>
            {url ? (
              <div className="grid gap-1">
                <div className="flex gap-2">
                  <Input readOnly aria-label="New link" value={url} onFocus={(e) => e.target.select()} />
                  <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => void copy(url)}>
                    <CopyIcon aria-hidden className="size-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Copy it now: the link is shown only once.</p>
              </div>
            ) : null}
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Links</h3>
            {shares.length ? (
              <ul className="grid gap-2">
                {shares.map((s) => (
                  <ShareItem key={s.id} share={s} defaultSeconds={defaultSeconds} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No links yet.</p>
            )}
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
