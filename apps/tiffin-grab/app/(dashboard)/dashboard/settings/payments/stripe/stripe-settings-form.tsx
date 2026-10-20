"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRightIcon, KeyRoundIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Separator } from "@foundry/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Badge } from "@/components/reui/badge";
import { SectionCard } from "@/components/ds";
import { PROVINCES } from "@/lib/tax/canada";
import {
  checkTaxReadinessAction,
  connectStripeAction,
  disconnectStripeAction,
  saveStripeSettingsAction,
  sendTestEventAction,
  setStripeEnabledAction,
} from "./actions";

export type StripeView = {
  connected: boolean;
  enabled: boolean;
  unhealthy: boolean;
  hint: string | null;
  livemode: boolean;
  accountId: string | null;
  lastEventAt: number | null;
  methodLabel: string;
  tax: { enabled: boolean; taxCode?: string; surchargeTaxable: boolean };
  surcharge: { enabled: boolean; ratePct: number; excludeProvinces: string[]; networksNotifiedOn?: string };
  taxCodes: { id: string; name: string; description: string }[];
};

type Readiness = { settingsActive: boolean; registrations: string[]; testReason: string | null; ok: boolean };
type Result = { error: string } | { ok: true; message?: string };

const WEEK_MS = 7 * 24 * 3600 * 1000;

// Client-only clock, read once: null on the server so "Last event" hydrates without a mismatch.
let mountedAt: number | null = null;
const subscribeNone = () => () => {};
const clientNow = () => (mountedAt ??= Date.now());
const serverNow = () => null;

function ago(at: number, now: number) {
  const mins = Math.max(0, Math.round((now - at) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 2880) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

export function StripeSettingsForm({ view }: { view: StripeView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [label, setLabel] = useState(view.methodLabel);
  const [tax, setTax] = useState(view.tax);
  const [sur, setSur] = useState(view.surcharge);
  const [ready, setReady] = useState<Readiness | null>(null);
  const now = useSyncExternalStore(subscribeNone, clientNow, serverNow);

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Saved");
      after?.();
      router.refresh();
    });

  const checkReadiness = () =>
    start(async () => {
      const r = await checkTaxReadinessAction(tax.taxCode ?? "");
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setReady(r);
    });

  const dirty =
    label !== view.methodLabel ||
    JSON.stringify(tax) !== JSON.stringify(view.tax) ||
    JSON.stringify(sur) !== JSON.stringify(view.surcharge);
  const codes =
    !tax.taxCode || view.taxCodes.some((c) => c.id === tax.taxCode)
      ? view.taxCodes
      : [{ id: tax.taxCode, name: tax.taxCode, description: "" }, ...view.taxCodes];
  const toggleProvince = (p: string) =>
    setSur({
      ...sur,
      excludeProvinces: sur.excludeProvinces.includes(p)
        ? sur.excludeProvinces.filter((x) => x !== p)
        : [...sur.excludeProvinces, p],
    });

  const keys = <KeysCard view={view} pending={pending} run={run} onDisconnect={() => setConfirmOpen(true)} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 content-start gap-6">
        {!view.connected && keys}

        <SectionCard title="Checkout" subtitle="How card payments appear to customers.">
          <div className="grid gap-4">
            <SettingRow
              id="enabled"
              title="Accept card payments"
              description={view.connected ? "Customers can pay by card at checkout and from payment links." : "Connect Stripe first."}
            >
              <Switch
                id="enabled"
                checked={view.enabled}
                disabled={pending || !view.connected}
                onCheckedChange={(v) => run(() => setStripeEnabledAction(v))}
              />
            </SettingRow>
            <Separator />
            <div className="grid gap-1.5 sm:max-w-sm">
              <Label htmlFor="methodLabel">Label at checkout</Label>
              <Input id="methodLabel" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Stripe Tax" subtitle="Stripe works out sales tax from the delivery address on every order, whatever the payment method.">
          <div className="grid gap-4">
            <div className="grid gap-1.5 sm:max-w-md">
              <Label htmlFor="taxCode">Tax code</Label>
              <Select
                value={tax.taxCode}
                onValueChange={(v) => {
                  setReady(null);
                  setTax({ ...tax, taxCode: v });
                }}
              >
                <SelectTrigger id="taxCode" className="w-full">
                  <SelectValue placeholder="Choose what you sell" />
                </SelectTrigger>
                <SelectContent>
                  {codes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Prepared meals are usually “Food for Immediate Consumption”.{" "}
                <a className="underline underline-offset-2" href="https://docs.stripe.com/tax/tax-codes" target="_blank" rel="noopener noreferrer">
                  All codes
                </a>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !tax.taxCode || !view.connected}
                onClick={checkReadiness}
              >
                Check setup
              </Button>
              {!ready && <p className="text-muted-foreground text-xs">Stripe Tax can be turned on once the check passes.</p>}
            </div>

            {ready && (
              <ul
                role="status"
                className="grid gap-2 text-sm duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] animate-in fade-in motion-reduce:animate-none"
              >
                <CheckRow ok={ready.settingsActive} label="Stripe Tax is active on the account" />
                <CheckRow
                  ok={ready.registrations.length > 0}
                  label={`Tax registrations: ${ready.registrations.join(", ") || "none"}`}
                />
                <CheckRow
                  ok={!!ready.testReason && ready.testReason !== "not_collecting"}
                  label="Test calculation for a Toronto address"
                />
              </ul>
            )}

            <Separator />
            <SettingRow
              id="taxOn"
              title="Use Stripe Tax"
              description="Off: your app tax rates apply (Settings → Payment → Taxes & coins). On: Stripe calculates it, and the app rates still apply if Stripe can't be reached. Tax waivers are ignored."
            >
              <Switch
                id="taxOn"
                checked={tax.enabled}
                disabled={!tax.enabled && !ready?.ok}
                onCheckedChange={(v) => setTax({ ...tax, enabled: v })}
              />
            </SettingRow>
            <SettingRow id="surTaxable" title="Tax the surcharge" description="Turn on if your accountant treats the surcharge as taxable.">
              <Switch
                id="surTaxable"
                checked={tax.surchargeTaxable}
                onCheckedChange={(v) => setTax({ ...tax, surchargeTaxable: v })}
              />
            </SettingRow>
          </div>
        </SectionCard>

        <SectionCard title="Card surcharge" subtitle="Added to credit cards only. Debit and prepaid cards are never surcharged.">
          <div className="grid gap-4">
            <SettingRow id="surOn" title="Add a surcharge" description="Customers see it as its own line before they pay.">
              <Switch id="surOn" checked={sur.enabled} onCheckedChange={(v) => setSur({ ...sur, enabled: v })} />
            </SettingRow>
            <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="rate">Rate (%)</Label>
                <Input
                  id="rate"
                  type="number"
                  inputMode="decimal"
                  step={0.1}
                  min={0}
                  max={2.4}
                  className="tabular-nums"
                  disabled={!sur.enabled}
                  value={sur.ratePct}
                  onChange={(e) => setSur({ ...sur, ratePct: Number(e.target.value) })}
                />
                <p className="text-muted-foreground text-xs">Canada caps it at 2.4%.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notified">Card networks told on</Label>
                <Input
                  id="notified"
                  type="date"
                  disabled={!sur.enabled}
                  value={sur.networksNotifiedOn ?? ""}
                  onChange={(e) => setSur({ ...sur, networksNotifiedOn: e.target.value || undefined })}
                />
                <p className="text-muted-foreground text-xs">Visa and Mastercard need 30 days’ notice.</p>
              </div>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">No surcharge in</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Provinces without a surcharge">
                {PROVINCES.map((p) => {
                  const on = sur.excludeProvinces.includes(p);
                  return (
                    <Button
                      key={p}
                      type="button"
                      size="sm"
                      variant={on ? "secondary" : "outline"}
                      aria-pressed={on}
                      disabled={!sur.enabled}
                      onClick={() => toggleProvince(p)}
                    >
                      {p}
                    </Button>
                  );
                })}
              </div>
              <p className="text-muted-foreground text-xs">Quebec bans surcharges, so keep QC selected if you deliver there.</p>
            </div>
          </div>
        </SectionCard>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={pending || !view.connected || !dirty}
            onClick={() => run(() => saveStripeSettingsAction({ methodLabel: label, tax, surcharge: sur }))}
          >
            Save changes
          </Button>
          {dirty && <p className="text-muted-foreground text-xs">You have unsaved changes.</p>}
        </div>

        {view.connected && keys}
      </div>

      <aside className="order-first grid content-start gap-6 lg:order-none">
        <StatusCard view={view} tax={view.tax} sur={view.surcharge} now={now} pending={pending} run={run} />
      </aside>

      <Dialog open={confirmOpen} onOpenChange={(o) => !pending && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Stripe?</DialogTitle>
            <DialogDescription>
              Card payments stop right away, Stripe is removed from your payment providers, and the webhook is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await disconnectStripeAction();
                  if ("error" in r) {
                    toast.error(r.error);
                    setConfirmOpen(false);
                    return;
                  }
                  toast.success("Stripe disconnected");
                  router.push("/dashboard/settings/payments");
                })
              }
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KeysCard({
  view,
  pending,
  run,
  onDisconnect,
}: {
  view: StripeView;
  pending: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
  onDisconnect: () => void;
}) {
  const [open, setOpen] = useState(!view.connected);
  const form = (
    <form
      className="grid gap-4 sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const el = e.currentTarget;
        run(() => connectStripeAction(new FormData(el)), () => {
          el.reset();
          setOpen(false);
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="secretKey">Restricted key</Label>
        <Input id="secretKey" name="secretKey" type="password" autoComplete="off" placeholder="rk_live_…" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="publishableKey">Publishable key</Label>
        <Input id="publishableKey" name="publishableKey" type="password" autoComplete="off" placeholder="pk_live_…" required />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {view.connected ? "Replace keys" : "Connect Stripe"}
        </Button>
        {view.connected && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );

  if (!view.connected) {
    return (
      <SectionCard
        title="Connect Stripe"
        subtitle="Create a restricted key in Stripe (Developers → API keys) and paste it with the publishable key. Keys are encrypted before they're saved."
      >
        {form}
      </SectionCard>
    );
  }

  return (
    <SectionCard title="API keys" subtitle="Keys are encrypted at rest and never shown again.">
      <Collapsible open={open} onOpenChange={setOpen} className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <KeyRoundIcon className="text-muted-foreground size-4" aria-hidden />
            <span className="truncate font-mono text-xs">{view.hint ?? "Key saved"}</span>
          </div>
          {!open && (
            <div className="flex flex-wrap gap-2">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Replace keys
                </Button>
              </CollapsibleTrigger>
              <Button type="button" variant="outline" size="sm" className="text-destructive" disabled={pending} onClick={onDisconnect}>
                Disconnect
              </Button>
            </div>
          )}
        </div>
        <CollapsibleContent>{form}</CollapsibleContent>
      </Collapsible>
    </SectionCard>
  );
}

function StatusCard({
  view,
  tax,
  sur,
  now,
  pending,
  run,
}: {
  view: StripeView;
  tax: StripeView["tax"];
  sur: StripeView["surcharge"];
  now: number | null;
  pending: boolean;
  run: (fn: () => Promise<Result>) => void;
}) {
  const stale = view.lastEventAt == null || (now != null && now - view.lastEventAt > WEEK_MS);
  const connection = view.unhealthy ? (
    <Badge variant="destructive-light">Key not working</Badge>
  ) : view.connected ? (
    <Badge variant="success-light">Connected</Badge>
  ) : (
    <Badge variant="outline">Not connected</Badge>
  );

  return (
    <SectionCard title="Status">
      <div className="grid gap-4">
        <dl className="grid gap-3 text-sm">
          <Fact label="Stripe">{connection}</Fact>
          {view.connected && (
            <>
              <Fact label="Mode">
                {view.livemode ? <Badge variant="primary-light">Live</Badge> : <Badge variant="warning-light">Test</Badge>}
              </Fact>
              <Fact label="Account">
                <span className="truncate font-mono text-xs">{view.accountId}</span>
              </Fact>
              <Fact label="Webhook">
                {view.lastEventAt == null ? (
                  <Badge variant="warning-light">No events yet</Badge>
                ) : (
                  <span className={stale ? "text-destructive" : undefined}>
                    {now == null ? "…" : ago(view.lastEventAt, now)}
                  </span>
                )}
              </Fact>
              <Fact label="Checkout">{view.enabled ? "Accepting cards" : "Off"}</Fact>
              <Fact label="Tax">{tax.enabled ? "Stripe Tax" : "App tax rates"}</Fact>
              <Fact label="Surcharge">
                <span className="tabular-nums">{sur.enabled ? `${sur.ratePct}% on credit` : "Off"}</span>
              </Fact>
            </>
          )}
        </dl>
        {view.unhealthy && (
          <p className="text-destructive text-sm">Stripe can’t be used right now. Replace the keys to reconnect.</p>
        )}
        {view.connected && (
          <div className="grid gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/payments/stripe" prefetch={false}>
                Stripe payments
                <ArrowUpRightIcon className="size-3.5" aria-hidden />
              </Link>
            </Button>
            {!view.livemode && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(sendTestEventAction)}>
                Send test event
              </Button>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function SettingRow({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid min-w-0 gap-0.5">
        <Label htmlFor={id}>{title}</Label>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="flex min-w-0 justify-end text-right font-medium">{children}</dd>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="min-w-0">{label}</span>
      {ok ? <Badge variant="success-light">Ready</Badge> : <Badge variant="destructive-light">Missing</Badge>}
    </li>
  );
}
