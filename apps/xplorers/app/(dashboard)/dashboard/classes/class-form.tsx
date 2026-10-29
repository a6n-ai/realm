"use client";

import { useActionState, useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import { PriceTableEditor } from "@/components/dashboard/price-table-editor";
import { colorVar } from "@/lib/sessions/calendar-events";
import { ATTENDANCE_LABELS, CATEGORY_LABELS, CLASS_COLORS } from "@/lib/sessions/format";
import { ATTENDANCE_MODES, SESSION_CATEGORIES } from "@/db/schema/studio";
import { offeredLengths } from "@/lib/pricing/resolve";
import type { ClassPricing, NamedOption, PriceCell, PriceTable } from "@/lib/pricing/types";
import { maxWindowMinutes, type RepeatPattern } from "@/lib/sessions/pattern";
import { createClassAction, updateClassAction, type ClassFormState } from "./class-actions";
import { ClassPhotosField } from "./class-photos";

export type ClassFormValues = {
  title: string;
  category: string;
  description: string;
  capacity: number;
  location: string;
  attendanceMode: string;
  published: boolean;
  photos: string[];
  included: string;
  scheduleLine: string;
  groupSize: string;
  ageMin: string;
  ageMax: string;
  ageWaiver: boolean;
  color: string;
  bookingType: string;
  pricing: ClassPricing;
  prices: PriceTable;
  pattern: RepeatPattern | null;
};

const EMPTY_PRICING: ClassPricing = {
  mode: "length",
  defaultLengthMinutes: 90,
  options: [],
  extension: null,
  adults: { free: 1, extraPrice: null },
};

const empty: ClassFormValues = {
  title: "",
  category: "kids",
  description: "",
  capacity: 8,
  location: "",
  attendanceMode: "either",
  published: false,
  photos: [],
  included: "",
  scheduleLine: "",
  groupSize: "",
  ageMin: "",
  ageMax: "",
  ageWaiver: false,
  color: "pink",
  bookingType: "bookable",
  pricing: EMPTY_PRICING,
  prices: {},
  pattern: null,
};

const WEEKDAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NTH = [1, 2, 3, 4, 5];

const BLANK_PATTERN: RepeatPattern = {
  weekdays: [],
  nthOfMonth: null,
  startClock: "10:00",
  endClock: "12:00",
  startsOn: "",
  endsOn: null,
  excludeMonths: [],
};

const toggle = (list: number[], n: number) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n]);
const minutesLabel = (m: number) => (m % 60 === 0 ? `${m / 60} hr` : `${m} min`);

function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

export function ClassForm({
  publicId,
  values,
  defaultPrices,
  readOnly,
}: {
  publicId?: string;
  values?: Partial<ClassFormValues>;
  defaultPrices: PriceTable;
  readOnly?: boolean;
}) {
  const initial = { ...empty, ...values };
  const [category, setCategory] = useState(initial.category);
  const [attendanceMode, setAttendanceMode] = useState(initial.attendanceMode);
  const [color, setColor] = useState(initial.color);
  const [bookingType, setBookingType] = useState(initial.bookingType);
  const [pricing, setPricing] = useState<ClassPricing>(initial.pricing);
  const [prices, setPrices] = useState<PriceTable>(initial.prices);
  const [pattern, setPattern] = useState<RepeatPattern | null>(initial.pattern);
  const action = publicId ? updateClassAction.bind(null, publicId) : createClassAction;
  const [state, formAction, pending] = useActionState<ClassFormState, FormData>(action, {});

  const bookable = bookingType === "bookable";
  const window = pattern ? maxWindowMinutes(pattern) : Number.POSITIVE_INFINITY;
  const priceKeys =
    pricing.mode === "options"
      ? pricing.options.map((o) => ({ key: `opt:${o.key}`, label: o.label || o.key }))
      : offeredLengths(pricing, defaultPrices, window).map((m) => ({ key: `len:${m}`, label: minutesLabel(m) }));
  // Keys that stopped being offered must not be submitted; the server rejects them.
  const offered = new Set(priceKeys.map((k) => k.key));
  const livePrices = Object.fromEntries(Object.entries(prices).filter(([k]) => offered.has(k)));

  const patchOption = (i: number, patch: Partial<NamedOption>) =>
    setPricing({ ...pricing, options: pricing.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const patchPattern = (patch: Partial<RepeatPattern>) => setPattern({ ...(pattern ?? BLANK_PATTERN), ...patch });
  const cellInput = (cell: PriceCell | undefined, onChange: (c: PriceCell) => void, label: string) => (
    <div className="flex gap-2">
      {(["weekday", "weekend"] as const).map((day) => (
        <Input
          key={day}
          type="number"
          min={0}
          step="0.01"
          className="w-28"
          aria-label={`${label} ${day}`}
          placeholder={day === "weekday" ? "Weekday" : "Weekend"}
          disabled={readOnly}
          value={cell?.[day] ?? ""}
          onChange={(e) => {
            const next = { ...cell };
            if (e.target.value === "") delete next[day];
            else next[day] = Number(e.target.value);
            onChange(next);
          }}
        />
      ))}
    </div>
  );

  return (
    <form action={formAction} className="grid max-w-3xl gap-8">
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="bookingType" value={bookingType} />
      <input type="hidden" name="pricing" value={JSON.stringify(pricing)} />
      <input type="hidden" name="prices" value={JSON.stringify(livePrices)} />
      <input type="hidden" name="pattern" value={JSON.stringify(pattern)} />

      <section className="grid gap-4">
        <h3 className="text-sm font-medium">Description</h3>
        <div className="grid gap-2">
          <Label htmlFor="title">Name</Label>
          <Input id="title" name="title" required defaultValue={initial.title} disabled={readOnly} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="description">Summary</Label>
          <Textarea id="description" name="description" rows={4} defaultValue={initial.description} disabled={readOnly} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="included">What is included</Label>
          <Textarea id="included" name="included" rows={3} defaultValue={initial.included} disabled={readOnly} />
        </div>
        <ClassPhotosField value={initial.photos} disabled={readOnly} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="scheduleLine">Schedule line</Label>
            <Input
              id="scheduleLine"
              name="scheduleLine"
              defaultValue={initial.scheduleLine}
              disabled={readOnly}
              placeholder="Saturdays, 10am to 1pm"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="groupSize">Group size</Label>
            <Input id="groupSize" name="groupSize" defaultValue={initial.groupSize} disabled={readOnly} placeholder="Up to 8 children" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <input type="hidden" name="category" value={category} />
            <Select value={category} onValueChange={setCategory} disabled={readOnly}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSION_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {CATEGORY_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="attendanceMode">Stay or drop-off</Label>
            <input type="hidden" name="attendanceMode" value={attendanceMode} />
            <Select value={attendanceMode} onValueChange={setAttendanceMode} disabled={readOnly}>
              <SelectTrigger id="attendanceMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {ATTENDANCE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor="ageMin">Age from</Label>
            <Input id="ageMin" name="ageMin" type="number" min={0} defaultValue={initial.ageMin} disabled={readOnly} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ageMax">Age to</Label>
            <Input id="ageMax" name="ageMax" type="number" min={0} defaultValue={initial.ageMax} disabled={readOnly} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm sm:col-span-2">
            <input type="checkbox" name="ageWaiver" defaultChecked={initial.ageWaiver} disabled={readOnly} className="size-4" />
            Allow outside the age range with a waiver
          </label>
        </div>
        <div className="grid gap-2">
          <Label>Colour</Label>
          <div className="flex gap-2" role="radiogroup" aria-label="Colour">
            {CLASS_COLORS.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={color === name}
                aria-label={name}
                disabled={readOnly}
                onClick={() => setColor(name)}
                style={{ backgroundColor: colorVar(name) }}
                className={`size-7 rounded-full transition-colors ${
                  color === name ? "ring-foreground ring-2 ring-offset-2" : ""
                }`}
              />
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input id="capacity" name="capacity" type="number" min={1} required defaultValue={initial.capacity} disabled={readOnly} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location">Location / bench</Label>
            <Input id="location" name="location" defaultValue={initial.location} disabled={readOnly} placeholder="Bench 01" />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <h3 className="text-sm font-medium">Booking</h3>
        <div className="flex gap-2">
          <Chip on={bookable} onClick={() => setBookingType("bookable")} disabled={readOnly}>
            Bookable online
          </Chip>
          <Chip on={!bookable} onClick={() => setBookingType("enquire_only")} disabled={readOnly}>
            Enquire only
          </Chip>
        </div>
        {bookable ? (
          <>
            <div className="flex gap-2">
              <Chip on={pricing.mode === "length"} onClick={() => setPricing({ ...pricing, mode: "length" })} disabled={readOnly}>
                Priced by length
              </Chip>
              <Chip on={pricing.mode === "options"} onClick={() => setPricing({ ...pricing, mode: "options" })} disabled={readOnly}>
                Named options
              </Chip>
            </div>
            {pricing.mode === "length" ? (
              <div className="grid gap-2 sm:w-56">
                <Label htmlFor="defaultLength">Shortest length (minutes)</Label>
                <Input
                  id="defaultLength"
                  type="number"
                  min={30}
                  step={30}
                  disabled={readOnly}
                  value={pricing.defaultLengthMinutes}
                  onChange={(e) => setPricing({ ...pricing, defaultLengthMinutes: Number(e.target.value) })}
                />
              </div>
            ) : (
              <div className="grid gap-2">
                {pricing.options.map((o, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div className="grid gap-1">
                      <Label className="text-xs">Key</Label>
                      <Input className="w-32" value={o.key} disabled={readOnly} onChange={(e) => patchOption(i, { key: e.target.value })} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Name</Label>
                      <Input className="w-40" value={o.label} disabled={readOnly} onChange={(e) => patchOption(i, { label: e.target.value })} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Minutes</Label>
                      <Input
                        className="w-24"
                        type="number"
                        min={30}
                        step={30}
                        value={o.lengthMinutes}
                        disabled={readOnly}
                        onChange={(e) => patchOption(i, { lengthMinutes: Number(e.target.value) })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Adults incl.</Label>
                      <Input
                        className="w-24"
                        type="number"
                        min={0}
                        value={o.adultsIncluded}
                        disabled={readOnly}
                        onChange={(e) => patchOption(i, { adultsIncluded: Number(e.target.value) })}
                      />
                    </div>
                    {readOnly ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPricing({ ...pricing, options: pricing.options.filter((_, j) => j !== i) })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                {readOnly ? null : (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPricing({
                          ...pricing,
                          options: [...pricing.options, { key: "", label: "", lengthMinutes: 60, adultsIncluded: 1 }],
                        })
                      }
                    >
                      Add option
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={readOnly}
                  checked={pricing.extension !== null}
                  onChange={(e) => setPricing({ ...pricing, extension: e.target.checked ? { stepMinutes: 30, price: {} } : null })}
                />
                Children can stay longer
              </label>
              {pricing.extension ? (
                <div className="flex gap-2">
                  <Chip
                    on={pricing.extension.stepMinutes === 30}
                    onClick={() => setPricing({ ...pricing, extension: { ...pricing.extension!, stepMinutes: 30 } })}
                    disabled={readOnly}
                  >
                    Per 30 min
                  </Chip>
                  <Chip
                    on={pricing.extension.stepMinutes === 60}
                    onClick={() => setPricing({ ...pricing, extension: { ...pricing.extension!, stepMinutes: 60 } })}
                    disabled={readOnly}
                  >
                    Per hour
                  </Chip>
                </div>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Adults</Label>
              <div className="flex flex-wrap items-end gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="adultsFree" className="text-xs">
                    Adults free
                  </Label>
                  <Input
                    id="adultsFree"
                    className="w-24"
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={pricing.adults.free}
                    onChange={(e) => setPricing({ ...pricing, adults: { ...pricing.adults, free: Number(e.target.value) } })}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    disabled={readOnly}
                    checked={pricing.adults.extraPrice !== null}
                    onChange={(e) =>
                      setPricing({ ...pricing, adults: { ...pricing.adults, extraPrice: e.target.checked ? {} : null } })
                    }
                  />
                  Extra adults allowed
                </label>
                {pricing.adults.extraPrice
                  ? cellInput(pricing.adults.extraPrice, (c) => setPricing({ ...pricing, adults: { ...pricing.adults, extraPrice: c } }), "Extra adult")
                  : null}
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Families send an enquiry instead of booking. No prices needed.</p>
        )}
      </section>

      <section className="grid gap-4">
        <h3 className="text-sm font-medium">Schedule</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            disabled={readOnly}
            checked={pattern !== null}
            onChange={(e) => setPattern(e.target.checked ? BLANK_PATTERN : null)}
          />
          Repeats on a pattern (sessions are created automatically)
        </label>
        {pattern ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Days</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(([n, label]) => (
                  <Chip key={n} on={pattern.weekdays.includes(n)} onClick={() => patchPattern({ weekdays: toggle(pattern.weekdays, n) })} disabled={readOnly}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Only these weeks of the month (leave empty for every week)</Label>
              <div className="flex flex-wrap gap-2">
                {NTH.map((n) => (
                  <Chip
                    key={n}
                    on={pattern.nthOfMonth?.includes(n) ?? false}
                    onClick={() => {
                      const next = toggle(pattern.nthOfMonth ?? [], n);
                      patchPattern({ nthOfMonth: next.length ? next : null });
                    }}
                    disabled={readOnly}
                  >
                    {n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="grid gap-2">
                <Label htmlFor="startClock">Starts</Label>
                <Input id="startClock" type="time" step={1800} value={pattern.startClock} disabled={readOnly} onChange={(e) => patchPattern({ startClock: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endClock">Ends</Label>
                <Input id="endClock" type="time" step={1800} value={pattern.endClock} disabled={readOnly} onChange={(e) => patchPattern({ endClock: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="startsOn">From</Label>
                <Input id="startsOn" type="date" value={pattern.startsOn} disabled={readOnly} onChange={(e) => patchPattern({ startsOn: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endsOn">Until (optional)</Label>
                <Input id="endsOn" type="date" value={pattern.endsOn ?? ""} disabled={readOnly} onChange={(e) => patchPattern({ endsOn: e.target.value || null })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Skip these months</Label>
              <div className="flex flex-wrap gap-2">
                {MONTHS.map((label, i) => (
                  <Chip key={label} on={pattern.excludeMonths.includes(i + 1)} onClick={() => patchPattern({ excludeMonths: toggle(pattern.excludeMonths, i + 1) })} disabled={readOnly}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Saving a changed pattern replaces future sessions that have no bookings and no edits. Today is left alone.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Without a pattern, schedule days one by one from Sessions.</p>
        )}
      </section>

      {bookable ? (
        <section className="grid gap-4">
          <h3 className="text-sm font-medium">Prices</h3>
          {priceKeys.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No lengths fit the schedule window yet. Widen the session times or add an option to set prices.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">Leave a price blank to use the studio default (shown faintly).</p>
              <PriceTableEditor keys={priceKeys} value={prices} onChange={setPrices} inherited={defaultPrices} />
            </>
          )}
          {pricing.extension ? (
            <div className="grid gap-2">
              <Label>Extension price per child per step</Label>
              {cellInput(pricing.extension.price, (c) => setPricing({ ...pricing, extension: { ...pricing.extension!, price: c } }), "Extension")}
            </div>
          ) : null}
        </section>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={initial.published} disabled={readOnly} className="size-4" />
        Published on the public calendar
      </label>
      {readOnly ? null : (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : publicId ? "Save class" : "Create class"}
          </Button>
        </div>
      )}
    </form>
  );
}
