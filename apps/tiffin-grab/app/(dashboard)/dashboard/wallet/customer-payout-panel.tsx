"use client";

import * as React from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { NumberField } from "../discounts/controls";
import {
  broadcastCustomerPayout,
  getPayoutCandidates,
  searchAccounts,
  type CustomerBroadcastResult,
} from "./actions";

const CARD_TITLE = "Customer payouts";
const CARD_SUBTITLE =
  "One-off bulk payout: filter down to a set of customers, review who's included, and award a coin amount. Not a standing rule — running the same filters again pays again.";

type AccountResult = { publicId: string; fullName: string | null; phone: string | null; email: string | null };
type Candidate = Awaited<ReturnType<typeof getPayoutCandidates>>[number];
type RevenueOp = ">" | "<" | "=";

function money(v: string): string {
  return `$${Number(v).toFixed(2)}`;
}

export function CustomerPayoutPanel({ cities }: { cities: string[] }) {
  // Filters
  const [account, setAccount] = React.useState<AccountResult | null>(null);
  const [accountQuery, setAccountQuery] = React.useState("");
  const [accountResults, setAccountResults] = React.useState<AccountResult[]>([]);
  const [searchingAccounts, startAccountSearch] = React.useTransition();
  const [revenueOp, setRevenueOp] = React.useState<RevenueOp | "">("");
  const [revenueValue, setRevenueValue] = React.useState("");
  const [startDateFrom, setStartDateFrom] = React.useState("");
  const [startDateTo, setStartDateTo] = React.useState("");
  const [city, setCity] = React.useState("");

  // Results
  const [candidates, setCandidates] = React.useState<Candidate[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [searching, startSearch] = React.useTransition();

  // Award
  const [coins, setCoins] = React.useState("0");
  const [awarding, startAward] = React.useTransition();

  const findAccounts = () => {
    startAccountSearch(async () => {
      try {
        const results = await searchAccounts(accountQuery);
        setAccountResults(results);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      }
    });
  };

  const runSearch = () => {
    const n = revenueValue.trim() ? Number(revenueValue) : null;
    if (revenueOp && (n === null || !Number.isFinite(n))) {
      toast.error("Enter a revenue amount");
      return;
    }
    startSearch(async () => {
      try {
        const rows = await getPayoutCandidates({
          accountPublicId: account?.publicId ?? null,
          revenueOp: revenueOp || null,
          revenueValue: n,
          startDateFrom: startDateFrom || null,
          startDateTo: startDateTo || null,
          city: city || null,
        });
        setCandidates(rows);
        setSelected(new Set(rows.map((r) => r.publicId))); // default: everyone matched is checked
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      }
    });
  };

  const toggle = (publicId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      candidates && prev.size === candidates.length ? new Set() : new Set(candidates?.map((c) => c.publicId)),
    );

  const award = () => {
    const n = parseInt(coins, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Coins must be a positive integer");
      return;
    }
    if (selected.size === 0) {
      toast.error("Select at least one customer");
      return;
    }
    startAward(async () => {
      try {
        const result: CustomerBroadcastResult = await broadcastCustomerPayout({
          userPublicIds: [...selected],
          coins: n,
        });
        const each = result.coinsPerCustomer === 1 ? "1 coin" : `${result.coinsPerCustomer} coins`;
        const cappedSuffix = result.capped > 0 ? ` — ${result.capped} blocked (would exceed the wallet cap)` : "";
        toast.success(`${result.awarded} customer${result.awarded === 1 ? "" : "s"} awarded ${each} each${cappedSuffix}`);
        setSelected(new Set());
        // Reset, not left at the just-awarded value: this field isn't cleared by
        // any other action, so a stray keystroke on the next visit would append
        // to a stale number instead of replacing it — the exact bug that just
        // over-awarded 20 real customers 155 coins instead of the intended 5.
        setCoins("0");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Payout failed");
      }
    });
  };

  return (
    <SectionCard title={CARD_TITLE} subtitle={CARD_SUBTITLE}>
      <div className="space-y-4">
        {/* Filters */}
        <div className="grid gap-3 rounded-lg border p-3">
          <div className="grid gap-1.5">
            <Label>Account (name or phone)</Label>
            {account ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{account.fullName ?? "Customer"}</span>
                <span className="text-muted-foreground">{account.phone ?? account.email}</span>
                <Button size="sm" variant="ghost" onClick={() => { setAccount(null); setAccountResults([]); setAccountQuery(""); }}>
                  Clear
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={accountQuery}
                  onChange={(e) => setAccountQuery(e.target.value)}
                  placeholder="Type a name or phone…"
                  className="w-56"
                />
                <Button size="sm" variant="outline" disabled={searchingAccounts} onClick={findAccounts}>
                  Find
                </Button>
                {accountResults.length > 0 && (
                  <div className="w-full rounded-lg border">
                    {accountResults.map((r) => (
                      <button
                        key={r.publicId}
                        type="button"
                        className="hover:bg-muted flex w-full items-center justify-between gap-2 border-b p-2 text-left text-sm last:border-b-0"
                        onClick={() => { setAccount(r); setAccountResults([]); }}
                      >
                        <span className="font-medium">{r.fullName ?? "Customer"}</span>
                        <span className="text-muted-foreground">{r.phone ?? r.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label>Revenue</Label>
              <div className="flex gap-2">
                <Select value={revenueOp} onValueChange={(v) => setRevenueOp(v as RevenueOp)}>
                  <SelectTrigger className="w-20"><SelectValue placeholder="op" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=">">&gt;</SelectItem>
                    <SelectItem value="<">&lt;</SelectItem>
                    <SelectItem value="=">=</SelectItem>
                  </SelectContent>
                </Select>
                <NumberField
                  id="cp-revenue-value"
                  label=""
                  prefix="$"
                  min={0}
                  step={0.01}
                  value={revenueValue}
                  onChange={setRevenueValue}
                  className="w-32"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Ordering since (from)</Label>
              <Input type="date" value={startDateFrom} onChange={(e) => setStartDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1.5">
              <Label>Ordering since (to)</Label>
              <Input type="date" value={startDateTo} onChange={(e) => setStartDateTo(e.target.value)} className="w-40" />
            </div>

            <div className="grid gap-1.5">
              <Label>City</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Any city" /></SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={runSearch} disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </Button>
          </div>
        </div>

        {/* Results */}
        {candidates && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {candidates.length} customer{candidates.length === 1 ? "" : "s"} matched, {selected.size} selected
              </p>
              {candidates.length > 0 && (
                <Button size="sm" variant="ghost" onClick={toggleAll}>
                  {selected.size === candidates.length ? "Deselect all" : "Select all"}
                </Button>
              )}
            </div>

            {candidates.length === 0 ? (
              <p className="text-muted-foreground text-sm">No customers match these filters.</p>
            ) : (
              <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border">
                {candidates.map((c) => (
                  <li key={c.publicId} className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      id={`cp-${c.publicId}`}
                      checked={selected.has(c.publicId)}
                      onChange={() => toggle(c.publicId)}
                      className="size-4 shrink-0"
                    />
                    <label htmlFor={`cp-${c.publicId}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="block font-medium">{c.name ?? "Customer"}</span>
                      <span className="text-muted-foreground block text-xs">
                        {c.phone ?? c.email} · {money(c.revenue)} · ordering since {c.firstOrderDate}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <NumberField id="cp-coins" label="Coins" min={0} step={1} value={coins} onChange={setCoins} className="w-36" />
              <Button onClick={award} disabled={awarding || selected.size === 0}>
                Award {selected.size || ""} customer{selected.size === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
