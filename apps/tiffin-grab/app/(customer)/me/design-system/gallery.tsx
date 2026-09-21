"use client";

import { CalendarDays, Pause, Inbox, Home, UtensilsCrossed, User } from "lucide-react";
import { useState } from "react";
import {
  ActionRow, BottomBar, Button, CoinChip, EmptyState, ListGroup, ListRow, MenuSection, NavPill, PageHeader, SelectableCard, StatTile, TabBar, ThemeToggle, Card, Chip, Countdown, DateStrip, Field, MonthGrid, Notice, Pill, Reason, Segmented,
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
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [day, setDay] = useState<string | null>("2026-09-23");
  const [sel, setSel] = useState<string | null>("2026-09-24");
  const days = ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"].map((date, i) => ({
    date,
    disabledReason: i === 3 ? "Already has a delivery" : undefined,
  }));
  return (
    <div className="mx-auto max-w-3xl space-y-10 p-4 pb-32 md:p-8">
      <PageHeader eyebrow="Customer design system" title="Same family as" accent="the plan form." subtitle="Every token and primitive, derived from /subscribe." action={<Button variant="primary" size="lg">Primary</Button>} />
      <Block title="Type scale">
        <p className="c-eyebrow">c-eyebrow 12/600 +0.25em</p>
        <p className="c-title">c-title 34-40 <em className="c-accent">accent.</em></p>
        <p className="c-h2">c-h2 22/700 card title</p>
        <p className="c-body">c-body 16/1.5 body copy</p>
        <p className="c-label">c-label 13/600 section label</p>
        <p className="c-caption">c-caption 13 muted</p>
        <p className="c-stat">28 <span className="c-caption">c-stat tabular</span></p>
      </Block>
      <Block title="Top bar (nav pills, coin chip, one theme button)">
        <div className="flex flex-wrap items-center gap-2">
          <NavPill href="#" active>Deliveries</NavPill><NavPill href="#">Menu</NavPill><NavPill href="#">Account</NavPill>
          <CoinChip href="#" balance={120} /><CoinChip href="#" balance={120} active />
          <ThemeToggle value={theme} onChange={setTheme} />
        </div>
      </Block>
      <Block title="Selectable cards">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectableCard selected title="Non-Veg Plan" description="Sabzi, daal and roti" indicator onClick={() => {}} />
          <SelectableCard selected={false} title="Veg Plan" description="Fresh every day" indicator onClick={() => {}} />
        </div>
      </Block>
      <Block title="Stat tiles, list rows, empty state">
        <div className="grid grid-cols-2 gap-3"><StatTile label="Remaining" value={12} unit="tiffins" hint="of 20" /><StatTile label="On hold" value={2} unit="days" /></div>
        <ListGroup><ListRow label="Profile" sublabel="Name, phone" href="#" icon={<User className="size-4" />} /><ListRow label="Coins" value="120" /></ListGroup>
        <EmptyState icon={<Inbox className="size-6" />} title="No tickets yet" body="Need help with an order? Start a ticket." action={<Button variant="primary">New ticket</Button>} />
      </Block>
      <Block title="Menu sheet content and bar">
        <MenuSection title="Appearance"><Segmented label="Theme" idPrefix="th" value={seg} onChange={setSeg} items={[{ id: "a", label: "Light" }, { id: "b", label: "System" }, { id: "c", label: "Dark" }]} /></MenuSection>
        <div className="relative h-40 overflow-hidden rounded-3xl border border-[var(--border)] [transform:translateZ(0)]">
          <BottomBar note="Pick a meal size to continue."><Button className="w-24">Back</Button><Button variant="primary" size="lg" className="flex-1" disabledReason="Pick a meal size">Next</Button></BottomBar>
          <TabBar items={[{ href: "#", label: "Home", icon: <Home className="size-5" />, active: true }, { href: "#", label: "Menu", icon: <UtensilsCrossed className="size-5" /> }]} />
        </div>
      </Block>
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
