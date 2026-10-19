"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { bookAction, quoteAction } from "@/app/(customer)/me/book/actions";
import { ageOn, checkAge } from "@/lib/children/age";
import { lengthLabel, money } from "@/lib/pricing/price-line";
import type { BookingChoice } from "@/lib/pricing/types";
import type { BookingRequest } from "@/lib/services/bookings.service";
import { formatSessionTime } from "@/lib/sessions/format";
import { BookHeader } from "./book-header";
import { ChildPicker } from "./child-picker";
import type { ChildView, QuoteView, WizardProps } from "./types";

const MIN_MS = 60_000;

function Stepper({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max: number; onChange: (n: number) => void }) {
  const btn = "flex size-11 items-center justify-center rounded-full border transition-colors disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label.toLowerCase()}`}>
          <MinusIcon className="size-4" />
        </button>
        <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label.toLowerCase()}`}>
          <PlusIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
        on ? "border-[var(--xl-pink-600)] bg-[var(--xl-pink-100)] text-[var(--xl-navy-900)] dark:bg-accent dark:text-foreground" : "bg-card"
      }`}
    >
      {children}
    </button>
  );
}

export function BookingWizard({ session, options, initialChildren, timeZone, currency, rails, coinsAvailable, backHref }: WizardProps) {
  const [step, setStep] = useState<3 | 4 | 5>(3);
  const [startIso, setStartIso] = useState(options.startTimes[0]!);
  const [choiceKey, setChoiceKey] = useState<string | null>(null);
  const [extSteps, setExtSteps] = useState(0);
  const [adults, setAdults] = useState(0);
  const [kids, setKids] = useState<ChildView[]>(initialChildren);
  const [picked, setPicked] = useState<string[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [code, setCode] = useState("");
  const [useCoins, setUseCoins] = useState(false);
  const [methodId, setMethodId] = useState(rails[0]?.id);
  const [answer, setAnswer] = useState<{ key: string; quote?: QuoteView; error?: string } | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [submitting, submit] = useTransition();

  const endMs = new Date(session.endsAt).getTime();
  const startMs = new Date(startIso).getTime();
  const roomMin = Math.floor((endMs - startMs) / MIN_MS);

  // Choices that still fit from the picked start; the stored key falls back to the first one that does.
  const fitting = useMemo(
    () =>
      options.mode === "options"
        ? options.options.filter((o) => o.lengthMinutes <= roomMin).map((o) => ({ key: `opt:${o.key}`, label: o.label, minutes: o.lengthMinutes, adultsIncluded: o.adultsIncluded, choice: { kind: "option", key: o.key } as BookingChoice }))
        : options.lengths.filter((m) => m <= roomMin).map((m) => ({ key: `len:${m}`, label: lengthLabel(m), minutes: m, adultsIncluded: 0, choice: { kind: "length", minutes: m } as BookingChoice })),
    [options, roomMin],
  );
  const chosen = fitting.find((f) => f.key === choiceKey) ?? fitting[0];
  const stepMinutes = options.extension?.stepMinutes ?? 0;
  const maxExt = chosen && stepMinutes ? Math.max(0, Math.floor((roomMin - chosen.minutes) / stepMinutes)) : 0;
  const ext = Math.min(extSteps, maxExt);
  const maxAdults = options.extraAdults ? 10 : options.adultsFree + (chosen?.adultsIncluded ?? 0);
  const adultCount = Math.min(adults, maxAdults);

  const request: BookingRequest | null = chosen
    ? {
        occurrencePublicId: session.occurrencePublicId,
        startsAt: startIso,
        choice: chosen.choice,
        extensionSteps: ext,
        childPublicIds: picked,
        adults: adultCount,
        code: code || null,
        useCoins,
        methodId,
      }
    : null;
  const requestKey = JSON.stringify(request);
  const current = answer?.key === requestKey ? answer : null;
  const quote = current?.quote ?? null;
  const error = bookError ?? current?.error ?? null;

  useEffect(() => {
    if (step !== 5 || !request) return;
    let stale = false;
    void quoteAction(request).then((res) => {
      if (!stale) setAnswer({ key: requestKey, ...("error" in res ? { error: res.error } : { quote: res.quote }) });
    });
    return () => {
      stale = true;
    };
    // requestKey is the request's identity; the request itself is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, requestKey]);

  const time = (iso: string) => formatSessionTime(new Date(iso), timeZone);
  const charges = rails.length > 0;
  const back = step === 3 ? backHref : () => {
    setBookError(null);
    setStep((step - 1) as 3 | 4);
  };

  const book = () =>
    request &&
    submit(async () => {
      setBookError(null);
      const res = await bookAction(request);
      if (res?.error) setBookError(res.error);
    });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-40 md:pb-28">
      <BookHeader step={step} back={back} />
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-balance">{session.title}</h1>
        <p className="text-muted-foreground text-sm">
          {session.dayLabel} · {time(session.startsAt)} – {time(session.endsAt)}
        </p>
      </div>

      {step === 3 ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Start time</h2>
            <div className="flex flex-wrap gap-2">
              {options.startTimes.map((iso) => (
                <Chip key={iso} on={iso === startIso} onClick={() => setStartIso(iso)}>
                  {time(iso)}
                </Chip>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{options.mode === "options" ? "Option" : "How long"}</h2>
            {fitting.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing fits from that start. Pick an earlier time.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {fitting.map((f) => (
                  <Chip key={f.key} on={f.key === chosen?.key} onClick={() => setChoiceKey(f.key)}>
                    {f.label}
                    {options.mode === "options" ? ` · ${lengthLabel(f.minutes)}` : ""}
                  </Chip>
                ))}
              </div>
            )}
          </section>
          {maxExt > 0 ? (
            <Stepper
              label={`Extra ${stepMinutes} min`}
              value={ext}
              max={maxExt}
              onChange={setExtSteps}
            />
          ) : null}
          {maxAdults > 0 || adultCount > 0 ? <Stepper label="Adults staying" value={adultCount} max={maxAdults} onChange={setAdults} /> : null}
        </div>
      ) : null}

      {step === 4 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Who is coming?</h2>
          <ChildPicker
            kids={kids}
            selected={picked}
            session={session}
            onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
            onAdded={(c) => {
              setKids((k) => [...k, c]);
              setPicked((p) =>
                p.length < session.remaining && checkAge(session, ageOn(c.dateOfBirth, session.occursOn)) !== "blocked" ? [...p, c.publicId] : p,
              );
            }}
          />
        </section>
      ) : null}

      {step === 5 ? (
        <section className="flex flex-col gap-4">
          <div className="bg-card flex flex-col gap-1 rounded-2xl border p-4 text-sm">
            <p className="font-semibold">
              {time(startIso)} – {quote ? time(quote.endsAt) : "…"}
            </p>
            <p className="text-muted-foreground">
              {picked.length} {picked.length === 1 ? "child" : "children"}: {kids.filter((k) => picked.includes(k.publicId)).map((k) => k.name).join(", ")}
            </p>
            {adultCount > 0 ? <p className="text-muted-foreground">{adultCount} {adultCount === 1 ? "adult" : "adults"} staying</p> : null}
          </div>

          {charges ? (
            <div className="flex flex-col gap-3">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setCode(codeInput.trim());
                }}
              >
                <div className="flex-1">
                  <Label htmlFor="book-code" className="sr-only">Discount code</Label>
                  <Input id="book-code" className="h-11" placeholder="Discount code" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} autoComplete="off" />
                </div>
                <Button type="submit" variant="outline" className="h-11">Apply</Button>
              </form>
              {coinsAvailable ? (
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5" checked={useCoins} onChange={(e) => setUseCoins(e.target.checked)} />
                  Use my coins
                </label>
              ) : null}
              {rails.length > 1 ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Payment method">
                  {rails.map((r) => (
                    <Chip key={r.id} on={r.id === methodId} onClick={() => setMethodId(r.id)}>
                      {r.label}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {!error && !quote ? (
            <div className="bg-muted h-28 animate-pulse rounded-2xl border" aria-label="Pricing" />
          ) : null}
          {quote ? (
            <div className="bg-card flex flex-col gap-2 rounded-2xl border p-4 text-sm">
              {charges ? (
                <>
                  <Line label={`${picked.length} × ${money(quote.perChild, currency)}`} amount={money(quote.perChild * picked.length, currency)} />
                  {quote.extensionPerChild > 0 ? <Line label="Extension" amount={money(quote.extensionPerChild * picked.length, currency)} /> : null}
                  {quote.adultCharge > 0 ? <Line label={`${quote.extraAdults} extra ${quote.extraAdults === 1 ? "adult" : "adults"}`} amount={money(quote.adultCharge, currency)} /> : null}
                  {quote.adjustments.map((a) => (
                    <Line key={`${a.kind}-${a.publicId}`} label={a.name} amount={`-${money(a.amount, currency)}`} />
                  ))}
                  {quote.taxTotal > 0 ? <Line label="Tax" amount={money(quote.taxTotal, currency)} /> : null}
                </>
              ) : null}
              {quote.codeError ? <p className="text-destructive">{quote.codeError}</p> : null}
              <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{charges ? money(quote.total, currency) : "Nothing to pay"}</span>
              </div>
              {charges && quote.total > 0 ? <p className="text-muted-foreground">You&apos;ll pay on the next screen to confirm.</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div role="alert" className="border-destructive/40 text-destructive rounded-2xl border p-3 text-sm">
          {error}
        </div>
      ) : null}

      {/* Sits above the mobile bottom nav. */}
      <div className="bg-background/95 fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 border-t px-4 py-3 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-xl gap-2">
          {step === 3 ? (
            <Button className="h-12 flex-1" disabled={!chosen} onClick={() => setStep(4)}>
              Choose children
            </Button>
          ) : null}
          {step === 4 ? (
            <Button className="h-12 flex-1" disabled={picked.length === 0} onClick={() => setStep(5)}>
              Review
            </Button>
          ) : null}
          {step === 5 ? (
            <Button className="h-12 flex-1" disabled={!quote || submitting} onClick={book}>
              {submitting ? "Booking…" : quote && charges && quote.total > 0 ? `Book and pay ${money(quote.total, currency)}` : "Confirm booking"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Line({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{amount}</span>
    </div>
  );
}
