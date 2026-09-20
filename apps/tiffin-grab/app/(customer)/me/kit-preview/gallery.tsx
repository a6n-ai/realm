"use client";

import { CalendarDays, Pause } from "lucide-react";
import { useState } from "react";
import {
  ActionRow, Button, Card, Chip, Countdown, DateStrip, Field, MonthGrid, Notice, Pill, Reason, Segmented,
  Sheet, Skeleton, StatusDot, StatusRing, Stepper, Tabs, Toast, Toggle, type DeliveryStatus,
} from "@/components/customer/kit";

const S: DeliveryStatus[] = ["delivered", "upcoming", "vacation", "hold", "combined"];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">{title}</h2>
      {children}
    </section>
  );
}

export function KitGallery() {
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState(false);
  const [tab, setTab] = useState("mon");
  const [seg, setSeg] = useState("a");
  const [on, setOn] = useState(true);
  const [n, setN] = useState(2);
  const [day, setDay] = useState<string | null>("2026-09-23");
  const [sel, setSel] = useState<string | null>("2026-09-24");
  const days = ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"].map((date, i) => ({
    date,
    disabledReason: i === 3 ? "Already has a delivery" : undefined,
  }));
  return (
    <div className="mx-auto max-w-3xl space-y-10 p-4 pb-32 md:p-8">
      <h1 className="text-[clamp(28px,5vw,40px)] font-bold tracking-[-0.03em]">Kit <em className="text-[var(--primary)]">preview.</em></h1>
      <Block title="Buttons">
        <div className="flex flex-wrap items-start gap-3">
          <Button variant="primary" size="lg">Primary</Button>
          <Button>Outline</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Danger</Button>
          <Button pending>Saving</Button>
          <Button disabledReason="Cutoff passed at 8:00 PM">Hold day</Button>
        </div>
      </Block>
      <Block title="Pills and chips">
        <div className="flex flex-wrap gap-2">
          {(["neutral", "brand", "ok", "up", "hold", "vac", "swap"] as const).map((t) => <Pill key={t} tone={t}>{t}</Pill>)}
          {(["neutral", "swap", "ok"] as const).map((t) => <Chip key={t} tone={t}>6 oz roti</Chip>)}
        </div>
      </Block>
      <Block title="Status">
        <div className="flex flex-wrap items-center gap-4">
          {S.map((s) => (
            <span key={s} className="flex items-center gap-2 text-sm"><StatusDot status={s} />{s}</span>
          ))}
          <StatusRing status="delivered"><span className="grid size-9 place-items-center font-semibold">21</span></StatusRing>
          <StatusRing status="combined"><span className="grid size-9 place-items-center font-semibold">22</span></StatusRing>
        </div>
      </Block>
      <Block title="Cards">
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-5">Plain card</Card>
          <Card interactive selected className="p-5">Selected interactive</Card>
        </div>
      </Block>
      <Block title="Tabs / Segmented">
        <Tabs label="Days" idPrefix="g" value={tab} onChange={setTab} items={[{ id: "mon", label: "Mon" }, { id: "tue", label: "Tue" }, { id: "wed", label: "Wed" }]} />
        <Segmented label="View" idPrefix="s" value={seg} onChange={setSeg} items={[{ id: "a", label: "Week" }, { id: "b", label: "Month" }]} />
      </Block>
      <Block title="Field, toggle, stepper">
        <Field label="Delivery note" hint="Gate code, buzzer" placeholder="Leave at door" />
        <Field label="Email" defaultValue="nope" error="Enter a valid email" />
        <div className="flex items-center gap-6"><Toggle label="Notify me" checked={on} onChange={setOn} /><Stepper label="Tiffins" value={n} min={0} max={4} onChange={setN} /></div>
      </Block>
      <Block title="Dates">
        <DateStrip label="Move to" days={days} value={day} onChange={setDay} />
        <Card className="p-4">
          <MonthGrid month="2026-09" selected={sel} onSelect={setSel} days={{
            "2026-09-21": { status: "delivered" }, "2026-09-22": { status: "upcoming" }, "2026-09-25": { status: "hold" },
            "2026-09-28": { status: "vacation" }, "2026-09-29": { status: "combined" }, "2026-09-30": { disabledReason: "Past cutoff" },
          }} />
        </Card>
        <Countdown target={Date.now() + 26 * 3600_000} />
      </Block>
      <Block title="Rows, notices">
        <Card className="p-2">
          <ActionRow icon={<Pause className="size-4" />} label="Hold this day" sublabel="Moves to the end of your plan" />
          <ActionRow icon={<CalendarDays className="size-4" />} label="Move" disabledReason="Locked, the kitchen has started" />
        </Card>
        <Reason>Cutoff is 8:00 PM the night before.</Reason>
        <Notice>Your plan renews in 3 days.</Notice>
        <Notice tone="error">Could not save. Try again.</Notice>
        <Skeleton className="h-16" />
      </Block>
      <div className="flex gap-3">
        <Button variant="primary" onClick={() => setSheet(true)}>Open sheet</Button>
        <Button onClick={() => setToast(true)}>Show toast</Button>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Hold this day" footer={<Button variant="primary" size="lg" className="w-full" onClick={() => setSheet(false)}>Confirm hold</Button>}>
        <Reason>Held days go to your remaining pool.</Reason>
        <div className="mt-4"><DateStrip label="Pick" days={days} value={day} onChange={setDay} /></div>
      </Sheet>
      <Toast open={toast} onClose={() => setToast(false)}>Day held</Toast>
    </div>
  );
}
