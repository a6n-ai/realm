"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
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

const WEEK_MS = 7 * 24 * 3600 * 1000;
const card = "space-y-4 rounded-xl border bg-muted/30 p-4";
const selectCls = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [label, setLabel] = useState(view.methodLabel);
  const [tax, setTax] = useState(view.tax);
  const [sur, setSur] = useState(view.surcharge);
  const [ready, setReady] = useState<Readiness | null>(null);
  const now = useSyncExternalStore(subscribeNone, clientNow, serverNow);

  const REJECTED_PREFIX = "Stripe rejected";
  const run = (fn: () => Promise<{ error: string } | { ok: true; message?: string }>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if ("error" in r) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Saved" });
      after?.();
      router.refresh();
    });

  const connect = (fd: FormData, form: HTMLFormElement) =>
    run(() => connectStripeAction(fd), () => form.reset());

  const checkReadiness = () =>
    start(async () => {
      setMsg(null);
      const r = await checkTaxReadinessAction(tax.taxCode ?? "");
      if ("error" in r) return setMsg({ ok: false, text: r.error });
      setReady(r);
    });

  const stale = view.lastEventAt == null || (now != null && now - view.lastEventAt > WEEK_MS);
  const codes = view.taxCodes.some((c) => c.id === tax.taxCode) || !tax.taxCode
    ? view.taxCodes
    : [{ id: tax.taxCode, name: tax.taxCode, description: "" }, ...view.taxCodes];

  return (
    <div className="space-y-5">
      {(view.unhealthy || msg?.text.startsWith(REJECTED_PREFIX)) && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {view.unhealthy ? "Stripe can't be used right now. Replace key to reconnect." : msg?.text}
        </p>
      )}

      <section className={card}>
        <h2 className="font-semibold">Connection</h2>
        {view.connected && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded border px-2 py-0.5 text-xs font-medium uppercase">{view.livemode ? "Live" : "Test"}</span>
            <span>{view.accountId}</span>
            {view.hint && <span className="text-muted-foreground">{view.hint}</span>}
            <span className={stale ? "text-destructive" : "text-muted-foreground"}>
              Last event: {view.lastEventAt ? (now == null ? "…" : ago(view.lastEventAt, now)) : "never"}
            </span>
          </div>
        )}
        <form
          className="grid gap-3 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            connect(new FormData(e.currentTarget), e.currentTarget);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="secretKey">Secret or restricted key</Label>
            <Input id="secretKey" name="secretKey" type="password" autoComplete="off" placeholder="rk_live_…" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="publishableKey">Publishable key</Label>
            <Input id="publishableKey" name="publishableKey" type="password" autoComplete="off" placeholder="pk_live_…" required />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>{view.connected ? "Replace keys" : "Connect"}</Button>
            {view.connected && (
              <>
                <Button type="button" variant="outline" disabled={pending || view.livemode} onClick={() => run(sendTestEventAction)}>
                  Send test event
                </Button>
                <Button type="button" variant="outline" className="text-destructive" disabled={pending} onClick={() => setConfirmOpen(true)}>
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Method</h2>
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="methodLabel">Label shown at checkout</Label>
          <Input id="methodLabel" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        {view.connected ? (
          <div className="flex items-center gap-2">
            <Switch id="enabled" checked={view.enabled} disabled={pending}
              onCheckedChange={(v) => run(() => setStripeEnabledAction(v))} />
            <Label htmlFor="enabled">Accept card payments</Label>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">Connect Stripe to accept card payments.</p>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Tax</h2>
        <p className="text-muted-foreground text-xs">
          Before enabling, confirm no tax waivers are configured. Stripe Tax ignores them.
        </p>
        <div className="grid max-w-md gap-1.5">
          <Label htmlFor="taxCode">Tax code</Label>
          <select
            id="taxCode"
            className={selectCls}
            value={tax.taxCode ?? ""}
            onChange={(e) => { setReady(null); setTax({ ...tax, taxCode: e.target.value || undefined }); }}
          >
            <option value="">Select…</option>
            {codes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <a className="text-xs underline" href="https://docs.stripe.com/tax/tax-codes" target="_blank" rel="noreferrer">Stripe tax codes</a>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={pending || !tax.taxCode || !view.connected} onClick={checkReadiness}>
            Check readiness
          </Button>
          {ready && (
            <ul className="text-sm">
              <li>{ready.settingsActive ? "OK" : "Missing"}: Stripe Tax settings active</li>
              <li>{ready.registrations.length ? "OK" : "Missing"}: registrations ({ready.registrations.join(", ") || "none"})</li>
              <li>{ready.testReason && ready.testReason !== "not_collecting" ? "OK" : "Failing"}: test calculation ({ready.testReason ?? "none"})</li>
              <li>{ready.ok ? "OK" : "Not ready"}: overall</li>
            </ul>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="taxOn" checked={tax.enabled} disabled={!tax.enabled && !ready?.ok} onCheckedChange={(v) => setTax({ ...tax, enabled: v })} />
          <Label htmlFor="taxOn">Use Stripe Tax for card payments</Label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={tax.surchargeTaxable} onChange={(e) => setTax({ ...tax, surchargeTaxable: e.target.checked })} />
          Surcharge is taxable
        </label>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Surcharge</h2>
        <p className="text-muted-foreground text-xs">Credit cards only. Debit and prepaid are never surcharged.</p>
        <div className="flex items-center gap-2">
          <Switch id="surOn" checked={sur.enabled} onCheckedChange={(v) => setSur({ ...sur, enabled: v })} />
          <Label htmlFor="surOn">Add a card surcharge</Label>
        </div>
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rate">Rate (%, max 2.4)</Label>
            <Input id="rate" type="number" step={0.1} min={0} max={2.4} value={sur.ratePct}
              onChange={(e) => setSur({ ...sur, ratePct: Number(e.target.value) })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notified">Networks notified on</Label>
            <Input id="notified" type="date" value={sur.networksNotifiedOn ?? ""}
              onChange={(e) => setSur({ ...sur, networksNotifiedOn: e.target.value || undefined })} />
          </div>
        </div>
        <div className="grid max-w-md gap-1.5">
          <Label htmlFor="excl">Excluded provinces</Label>
          <select id="excl" multiple className={`${selectCls} h-28`} value={sur.excludeProvinces}
            onChange={(e) => setSur({ ...sur, excludeProvinces: Array.from(e.target.selectedOptions, (o) => o.value) })}>
            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending || !view.connected}
          onClick={() => run(() => saveStripeSettingsAction({ methodLabel: label, tax, surcharge: sur }))}>
          Save Stripe settings
        </Button>
        {msg && <p className={msg.ok ? "text-sm" : "text-destructive text-sm"}>{msg.text}</p>}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Stripe?</DialogTitle>
            <DialogDescription>Card payments stop immediately and the webhook endpoint is removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={pending}
              onClick={() => { setConfirmOpen(false); start(async () => {
                const r = await disconnectStripeAction();
                if ("error" in r) return setMsg({ ok: false, text: r.error });
                router.push("/dashboard/settings/payments");
              }); }}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
