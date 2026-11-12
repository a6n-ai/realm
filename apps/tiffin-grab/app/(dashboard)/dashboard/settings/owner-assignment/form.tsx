"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CornerLeftUpIcon, Loader2Icon, MinusIcon, PercentIcon, PlusIcon, RefreshCwIcon, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Button } from "@foundry/ui/button";
import { Card } from "@foundry/ui/card";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Separator } from "@foundry/ui/separator";
import { Switch } from "@foundry/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { Alert, AlertDescription } from "@/components/reui/alert";
import type { OwnerEntity, Strategy } from "@/lib/services/assignment";
import { poolSummary, sharePct } from "@/lib/services/owner-summary";
import { unwrapAction } from "@/lib/actions/unwrap";
import { saveEntityStrategy, saveMembership, saveStrategy } from "./actions";

const CHOICES: { value: Strategy; title: string; line: string; icon: LucideIcon }[] = [
  { value: "round_robin", title: "Round robin", line: "Take turns across the pool.", icon: RefreshCwIcon },
  { value: "percentage", title: "Percentage", line: "Split by weight.", icon: PercentIcon },
];

type Choice = { value: string; title: string; line: string; icon: LucideIcon };

// Radio cards for a rule. `compact` (per-source rows) drops the description to keep three cards on one line.
function StrategyCards({
  value, onChange, choices, label, compact,
}: {
  value: string;
  onChange: (v: string) => void;
  choices: Choice[];
  label: string;
  compact?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onChange}
      className={compact ? "grid-cols-1 gap-2 sm:grid-cols-3" : "grid-cols-1 gap-3 sm:grid-cols-2"}
      aria-label={label}
    >
      {choices.map((c) => (
        <label
          key={c.value}
          className={`has-data-[state=checked]:border-primary flex cursor-pointer rounded-lg border transition-colors hover:bg-muted/50 ${compact ? "items-center gap-3 p-3" : "flex-col gap-2 p-4"}`}
        >
          {compact ? (
            <>
              <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
                <c.icon className="size-4" />
              </span>
              <span className="flex-1 text-sm font-medium">{c.title}</span>
              <RadioGroupItem value={c.value} />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
                  <c.icon className="size-4" />
                </span>
                <RadioGroupItem value={c.value} />
              </div>
              <span className="text-sm font-medium">{c.title}</span>
              <span className="text-muted-foreground text-xs">{c.line}</span>
            </>
          )}
        </label>
      ))}
    </RadioGroup>
  );
}

const TABS: { value: OwnerEntity; label: string }[] = [
  { value: "inquiry", label: "Inquiries" },
  { value: "order", label: "Orders" },
  { value: "ticket", label: "Tickets" },
];

const DEFAULT_OVERRIDE = "__default__";
const DEFAULT_POOL = "";
const EASE = "duration-200 ease-soft";

export type Source = { key: string; label: string };
export type StaffOption = { userId: string; publicId: string; name: string | null };
// userId -> weight, present means in the pool.
type Pool = Record<string, number>;
export type TabState = { strategy: Strategy; perSource: Record<string, Strategy>; pools: Record<string, Pool> };
export type TabStates = Record<OwnerEntity, TabState>;

const label = (s: StaffOption) => s.name ?? s.publicId;

function sorted<T>(o: Record<string, T>): [string, T][] {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}

function fingerprint(s: TabState): string {
  return JSON.stringify([s.strategy, sorted(s.perSource), sorted(s.pools).map(([k, p]) => [k, sorted(p)])]);
}

const poolFingerprint = (p: Pool | undefined) => JSON.stringify(sorted(p ?? {}));

export function OwnerAssignmentForm({
  initialEntity,
  initial,
  sources,
  staff,
  cursor,
}: {
  initialEntity: OwnerEntity;
  initial: TabStates;
  sources: Source[];
  staff: StaffOption[];
  cursor: Record<string, string>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<OwnerEntity>(initialEntity);
  const [saved, setSaved] = useState<TabStates>(initial);
  const [draft, setDraft] = useState<TabStates>(initial);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [pending, start] = useTransition();
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const state = draft[tab];
  const dirty = fingerprint(state) !== fingerprint(saved[tab]);
  const patch = (next: Partial<TabState>) => {
    setFlash(false);
    setDraft((d) => ({ ...d, [tab]: { ...d[tab], ...next } }));
  };
  const setPool = (key: string, pool: Pool) => patch({ pools: { ...state.pools, [key]: pool } });

  // The URL is the tab's source of truth on reload; the draft state lives above the tabs so switching never drops edits.
  const changeTab = (next: string) => {
    setTab(next as OwnerEntity);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("entity", next);
    window.history.replaceState(null, "", url);
  };

  const save = () => {
    const entity = tab;
    const before = saved[entity];
    const after = draft[entity];
    setError(null);
    start(async () => {
      try {
        // Sequential: strategy writes read-modify-write the shared assignment config.
        if (entity === "inquiry") {
          if (before.strategy !== after.strategy || JSON.stringify(sorted(before.perSource)) !== JSON.stringify(sorted(after.perSource))) {
            await unwrapAction(saveStrategy(after.strategy, after.perSource));
          }
        } else if (before.strategy !== after.strategy) {
          await unwrapAction(saveEntityStrategy(entity, after.strategy));
        }
        for (const [key, pool] of Object.entries(after.pools)) {
          if (poolFingerprint(pool) === poolFingerprint(before.pools[key])) continue;
          await unwrapAction(saveMembership(entity, key === DEFAULT_POOL ? null : key, Object.entries(pool).map(([userId, weight]) => ({ userId, weight }))));
        }
        setSaved((s) => ({ ...s, [entity]: after }));
        setFlash(true);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(false), 1500);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  const defaultPool = state.pools[DEFAULT_POOL] ?? {};
  const members = staff.filter((s) => s.userId in defaultPool).map((s) => ({ publicId: s.publicId, name: label(s), weight: defaultPool[s.userId] }));
  const cursorKey = tab === "order" ? "orders" : tab === "ticket" ? "tickets" : undefined;
  const summary = poolSummary(tab, state.strategy, members, cursorKey ? cursor[cursorKey] : undefined);
  const showWeights = state.strategy === "percentage";

  return (
    <div className="grid gap-6">
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {fingerprint(draft[t.value]) !== fingerprint(saved[t.value]) && <span className="bg-primary size-1.5 rounded-full" aria-label="Unsaved changes" />}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">How owners are chosen</h2>
        {/* The creator rule is fixed in code; this setting only covers records nobody on staff created. */}
        <p className="text-muted-foreground text-sm">Staff who add a record always own it. Records from customers or the website are shared out like this:</p>
        <StrategyCards
          value={state.strategy}
          onChange={(v) => patch({ strategy: v as Strategy })}
          choices={CHOICES}
          label="How owners are chosen"
        />
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Who&apos;s in the pool</h2>
        <PoolGroup
          staff={staff}
          pool={defaultPool}
          onChange={(p) => setPool(DEFAULT_POOL, p)}
          showWeights={showWeights}
          footer={summary && <SummaryRow summary={summary} />}
        />
      </section>

      {tab === "inquiry" && (
        <section className="grid gap-3">
          <div className="grid gap-1">
            <h2 className="text-sm font-medium">Per source</h2>
            <p className="text-muted-foreground text-xs">A source with its own strategy or pool overrides the default above. An empty pool falls back to the default pool.</p>
          </div>
          {sources.length === 0 ? (
            <p className="text-muted-foreground text-sm">No inbound lead sources configured.</p>
          ) : (
            sources.map((src) => {
              const own = state.perSource[src.key];
              return (
                <div key={src.key} className="grid gap-2">
                  <span className="text-sm font-medium">{src.label}</span>
                  <StrategyCards
                    value={own ?? DEFAULT_OVERRIDE}
                    onChange={(v) => {
                      const next = { ...state.perSource };
                      if (v === DEFAULT_OVERRIDE) delete next[src.key];
                      else next[src.key] = v as Strategy;
                      patch({ perSource: next });
                    }}
                    choices={[{ value: DEFAULT_OVERRIDE, title: "Same as default", line: "Follow the rule above.", icon: CornerLeftUpIcon }, ...CHOICES]}
                    label={`${src.label} strategy`}
                    compact
                  />
                  <PoolGroup
                    staff={staff}
                    pool={state.pools[src.key] ?? {}}
                    onChange={(p) => setPool(src.key, p)}
                    showWeights={(own ?? state.strategy) === "percentage"}
                  />
                </div>
              );
            })
          )}
        </section>
      )}

      <div className="sticky bottom-4 flex flex-col items-end gap-2">
        {error && (
          <Alert variant="destructive" className="w-full">
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={save} disabled={pending}>Retry</Button>
            </AlertDescription>
          </Alert>
        )}
        <Button onClick={save} disabled={!dirty || pending} aria-live="polite">
          {pending ? <Loader2Icon className="animate-spin" /> : flash && !dirty ? <CheckIcon /> : null}
          {pending ? "Saving" : flash && !dirty ? "Saved" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ summary }: { summary: { lead: string; name: string | null; tail: string } }) {
  return (
    <div className="bg-muted/40 flex items-center gap-3 px-4 py-3">
      {summary.name && <Initial name={summary.name} />}
      <p className="text-sm">
        {summary.lead}
        {summary.name && <b className="font-semibold">{summary.name}</b>}
        {summary.tail}
      </p>
    </div>
  );
}

function Initial({ name }: { name: string }) {
  return (
    <Avatar size="sm">
      <AvatarFallback>{name.trim().charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function PoolGroup({
  staff,
  pool,
  onChange,
  showWeights,
  footer,
}: {
  staff: StaffOption[];
  pool: Pool;
  onChange: (p: Pool) => void;
  showWeights: boolean;
  footer?: ReactNode;
}) {
  const inPool = staff.filter((s) => s.userId in pool);
  const total = inPool.map((s) => ({ weight: pool[s.userId] }));
  return (
    <Card className="gap-0 py-0">
      {staff.map((s, i) => {
        const on = s.userId in pool;
        return (
          <div key={s.userId}>
            {i > 0 && <Separator />}
            <PoolRow
              name={label(s)}
              on={on}
              weight={pool[s.userId] ?? 1}
              share={on ? sharePct(pool[s.userId], total) : 0}
              showWeight={showWeights && on}
              onToggle={(next) => {
                const copy = { ...pool };
                if (next) copy[s.userId] = 1;
                else delete copy[s.userId];
                onChange(copy);
              }}
              onWeight={(w) => onChange({ ...pool, [s.userId]: w })}
            />
          </div>
        );
      })}
      {inPool.length === 0 && (
        <>
          {staff.length > 0 && <Separator />}
          <p className="text-muted-foreground px-4 py-3 text-sm">No one in the pool. Turn someone on above.</p>
        </>
      )}
      {footer && (
        <>
          <Separator />
          {footer}
        </>
      )}
    </Card>
  );
}

function PoolRow({
  name,
  on,
  weight,
  share,
  showWeight,
  onToggle,
  onWeight,
}: {
  name: string;
  on: boolean;
  weight: number;
  share: number;
  showWeight: boolean;
  onToggle: (on: boolean) => void;
  onWeight: (w: number) => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 transition-opacity ${EASE} ${on ? "" : "opacity-60"}`}>
      <Initial name={name} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <span className="truncate text-sm">{name}</span>
        {showWeight && (
          <div className={`animate-in fade-in flex items-center gap-2 motion-reduce:animate-none ${EASE}`}>
            <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full" role="progressbar" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} share`}>
              <div className={`bg-primary h-full w-full origin-left transition-transform ${EASE}`} style={{ transform: `scaleX(${share / 100})` }} />
            </div>
            <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">{share}%</span>
          </div>
        )}
      </div>
      {showWeight && (
        <div className={`animate-in fade-in flex items-center gap-1 motion-reduce:animate-none ${EASE}`}>
          <Button variant="outline" size="icon-sm" aria-label={`Decrease ${name} weight`} disabled={weight <= 1} onClick={() => onWeight(weight - 1)}>
            <MinusIcon />
          </Button>
          <span className="w-6 text-center text-sm tabular-nums">{weight}</span>
          <Button variant="outline" size="icon-sm" aria-label={`Increase ${name} weight`} onClick={() => onWeight(weight + 1)}>
            <PlusIcon />
          </Button>
        </div>
      )}
      <Switch checked={on} onCheckedChange={onToggle} aria-label={`${name} in pool`} />
    </div>
  );
}
