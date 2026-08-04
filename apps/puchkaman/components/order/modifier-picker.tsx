"use client";

import { money } from "@/lib/cart/types";
import {
  isRequired,
  isSingleChoice,
  toggleModifier,
  type PublicModifierGroup,
} from "@/lib/orders/modifier-types";

/**
 * Modifier chooser shared by the quick-add sheet and the product page.
 *
 * Controlled: the caller owns the selected ids so both surfaces can drive the same
 * rules. Group limits are enforced here for feedback only — the server re-validates
 * every selection, since none of this is trustworthy.
 */
export function ModifierPicker({
  groups,
  selected,
  onChange,
  idPrefix,
}: {
  groups: PublicModifierGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Keeps input names unique when two pickers share a page. */
  idPrefix: string;
}) {
  if (!groups.length) return null;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {groups.map((group) => {
        const single = isSingleChoice(group);
        const required = isRequired(group);
        const chosenInGroup = group.modifiers.filter((m) =>
          selected.includes(m.cloverModifierId),
        ).length;
        const atCap = group.maxAllowed != null && chosenInGroup >= group.maxAllowed;

        return (
          <fieldset
            key={group.cloverModifierGroupId}
            style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
          >
            <legend style={{ padding: 0, marginBottom: 8, width: "100%" }}>
              <span style={{ fontWeight: 800, fontSize: "1.02rem" }}>{group.name}</span>{" "}
              <span style={{ fontWeight: 600, fontSize: "0.8rem", opacity: 0.75 }}>
                {required
                  ? single
                    ? "· Required"
                    : `· Choose at least ${group.minRequired}`
                  : group.maxAllowed != null
                    ? `· Up to ${group.maxAllowed}`
                    : "· Optional"}
              </span>
            </legend>

            <div style={{ display: "grid", gap: 8 }}>
              {group.modifiers.map((modifier) => {
                const checked = selected.includes(modifier.cloverModifierId);
                // At the cap, unchosen options go disabled rather than silently
                // ignoring the tap.
                const disabled = !checked && !single && atCap;
                return (
                  <label
                    key={modifier.cloverModifierId}
                    className="card"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 13px",
                      background: checked ? "var(--yellow)" : "var(--white)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.5 : 1,
                      minHeight: 44,
                    }}
                  >
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`${idPrefix}-${group.cloverModifierGroupId}`}
                      checked={checked}
                      disabled={disabled}
                      onChange={() =>
                        onChange(toggleModifier(group, selected, modifier.cloverModifierId))
                      }
                      style={{ width: 18, height: 18, flexShrink: 0 }}
                    />
                    <span style={{ fontWeight: 700, flex: 1, minWidth: 0 }}>{modifier.name}</span>
                    {modifier.price > 0 ? (
                      <span style={{ fontWeight: 800, flexShrink: 0 }}>
                        +{money(modifier.price)}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
