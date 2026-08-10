"use client";

import { useId } from "react";
import { TAG_STYLE } from "@/lib/menu-categories";
import {
  activeFilterCount,
  countItems,
  EMPTY_FILTERS,
  filterCategories,
  hasDietData,
  PRICE_BANDS,
  previewCount,
  type EatsCategory,
  type EatsFilterState,
  type EatsSort,
} from "./eats-filters";

const SORTS: { value: EatsSort; label: string }[] = [
  { value: "menu", label: "Menu order" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

const DIET_OPTIONS: { id: "veg" | "nonveg"; label: string }[] = [
  { id: "veg", label: "Vegetarian" },
  { id: "nonveg", label: "Non-veg" },
];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function EatsFilterPanel({
  categories,
  tags,
  value,
  onChange,
  orderingEnabled,
}: {
  /** Unfiltered, so counts stay stable as the customer narrows down. */
  categories: EatsCategory[];
  tags: string[];
  value: EatsFilterState;
  onChange: (next: EatsFilterState) => void;
  orderingEnabled: boolean;
}) {
  const id = useId();
  const count = activeFilterCount(value);

  const dietAvailable = hasDietData(categories);
  const shown = filterCategories(categories, value);
  const shownItems = countItems(shown);

  /** Every applied filter as one removable chip, so a narrowed menu can always
   *  be widened one step at a time instead of only by clearing everything. */
  const chips: { key: string; label: string; clear: () => void }[] = [
    ...(value.query.trim()
      ? [{ key: "q", label: `“${value.query.trim()}”`, clear: () => onChange({ ...value, query: "" }) }]
      : []),
    ...(value.availableOnly
      ? [{ key: "avail", label: "Available right now", clear: () => onChange({ ...value, availableOnly: false }) }]
      : []),
    ...(value.diet
      ? [
          {
            key: "diet",
            label: value.diet === "veg" ? "Vegetarian" : "Non-vegetarian",
            clear: () => onChange({ ...value, diet: null }),
          },
        ]
      : []),
    ...(value.maxPrice != null
      ? [
          {
            key: "price",
            label: PRICE_BANDS.find((b) => b.maxPrice === value.maxPrice)?.label ?? `Under $${value.maxPrice}`,
            clear: () => onChange({ ...value, maxPrice: null }),
          },
        ]
      : []),
    ...value.tags.map((t) => ({
      key: `tag-${t}`,
      label: TAG_STYLE[t]?.label ?? t,
      clear: () => onChange({ ...value, tags: value.tags.filter((x) => x !== t) }),
    })),
    ...value.categoryIds.map((cid) => ({
      key: `cat-${cid}`,
      label: categories.find((c) => c.id === cid)?.name ?? cid,
      clear: () => onChange({ ...value, categoryIds: value.categoryIds.filter((x) => x !== cid) }),
    })),
  ];

  return (
    <div className="eats-filters">
      <div className="eats-filters__head">
        <h2 className="eats-filters__title">Filter</h2>
        {count > 0 ? (
          <button type="button" className="eats-filters__clear" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear ({count})
          </button>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor={`${id}-q`}>Search</label>
        <input
          id={`${id}-q`}
          type="search"
          className="input"
          placeholder="Puchka, roll, mango…"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
        />
      </div>

      {chips.length ? (
        <div className="eats-active">
          <div className="eats-active__head">
            <h3>Active ({count})</h3>
            <button type="button" className="eats-filters__clear" onClick={() => onChange(EMPTY_FILTERS)}>
              Clear all
            </button>
          </div>
          <div className="eats-active__chips">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="eats-active__chip"
                onClick={chip.clear}
                aria-label={`Remove filter ${chip.label}`}
              >
                {chip.label} <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
          <p className="eats-active__count" aria-live="polite">
            {shownItems} item{shownItems === 1 ? "" : "s"} · {shown.length} section
            {shown.length === 1 ? "" : "s"}
          </p>
        </div>
      ) : null}

      {orderingEnabled ? (
        <label className={`eats-check eats-check--solo ${value.availableOnly ? "is-on" : ""}`}>
          <input
            type="checkbox"
            className="eats-vh-input"
            checked={value.availableOnly}
            onChange={(e) => onChange({ ...value, availableOnly: e.target.checked })}
          />
          <span className="eats-check__label">Available right now</span>
          <span className="eats-toggle-switch" aria-hidden="true" />
        </label>
      ) : null}

      {tags.length ? (
        <fieldset className="eats-filters__group">
          <legend>Highlights</legend>
          <div className="eats-tagrow">
            {tags.map((t) => {
              const on = value.tags.includes(t);
              const n = previewCount(categories, value, { tags: toggle(value.tags, t) });
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && n === 0}
                  className={`eats-tag ${on ? "is-on" : ""}`}
                  onClick={() => onChange({ ...value, tags: toggle(value.tags, t) })}
                >
                  {TAG_STYLE[t]?.label ?? t}
                  <span className="eats-tag__count">{n}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {dietAvailable ? (
        <fieldset className="eats-filters__group">
          <legend>Dietary</legend>
          <div className="eats-tagrow">
            {DIET_OPTIONS.map((opt) => {
              const on = value.diet === opt.id;
              const n = previewCount(categories, value, { diet: on ? null : opt.id });
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && n === 0}
                  className={`eats-tag ${on ? "is-on" : ""}`}
                  onClick={() => onChange({ ...value, diet: on ? null : opt.id })}
                >
                  {opt.label}
                  <span className="eats-tag__count">{n}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="eats-filters__group">
        <legend>Price</legend>
        <div className="eats-checklist">
          {PRICE_BANDS.map((band) => {
            const on = value.maxPrice === band.maxPrice;
            const n = previewCount(categories, value, { maxPrice: on ? null : band.maxPrice });
            return (
              <label key={band.id} className={`eats-check ${on ? "is-on" : ""} ${!on && n === 0 ? "is-empty" : ""}`}>
                <input
                  type="checkbox"
                  className="eats-vh-input"
                  checked={on}
                  disabled={!on && n === 0}
                  onChange={() => onChange({ ...value, maxPrice: on ? null : band.maxPrice })}
                />
                <span className="eats-check__label">{band.label}</span>
                <span className="eats-check__count">{n}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="eats-filters__group">
        <legend>Sections</legend>
        <div className="eats-checklist">
          {categories.map((c) => {
            const on = value.categoryIds.includes(c.id);
            // What picking this section would actually show, not its raw size:
            // with a search or a price band on, the raw count overpromises.
            const n = previewCount(categories, value, { categoryIds: toggle(value.categoryIds, c.id) });
            return (
              <label
                key={c.id}
                className={`eats-check ${on ? "is-on" : ""} ${!on && n === 0 ? "is-empty" : ""}`}
              >
                <input
                  type="checkbox"
                  className="eats-vh-input"
                  checked={on}
                  disabled={!on && n === 0}
                  onChange={() => onChange({ ...value, categoryIds: toggle(value.categoryIds, c.id) })}
                />
                <span className="eats-check__label">{c.name}</span>
                <span className="eats-check__count">{n}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-sort`}>Sort</label>
        <select
          id={`${id}-sort`}
          className="select"
          value={value.sort}
          onChange={(e) => onChange({ ...value, sort: e.target.value as EatsSort })}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
