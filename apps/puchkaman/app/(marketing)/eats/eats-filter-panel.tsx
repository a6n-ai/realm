"use client";

import { useId } from "react";
import { TAG_STYLE } from "@/lib/menu-categories";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  type EatsCategory,
  type EatsFilterState,
  type EatsSort,
} from "./eats-filters";

const SORTS: { value: EatsSort; label: string }[] = [
  { value: "menu", label: "Menu order" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
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
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  className={`eats-tag ${on ? "is-on" : ""}`}
                  onClick={() => onChange({ ...value, tags: toggle(value.tags, t) })}
                >
                  {TAG_STYLE[t]?.label ?? t}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="eats-filters__group">
        <legend>Sections</legend>
        <div className="eats-checklist">
          {categories.map((c) => {
            const on = value.categoryIds.includes(c.id);
            return (
              <label key={c.id} className={`eats-check ${on ? "is-on" : ""}`}>
                <input
                  type="checkbox"
                  className="eats-vh-input"
                  checked={on}
                  onChange={() => onChange({ ...value, categoryIds: toggle(value.categoryIds, c.id) })}
                />
                <span className="eats-check__label">{c.name}</span>
                <span className="eats-check__count">{c.items.length}</span>
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
