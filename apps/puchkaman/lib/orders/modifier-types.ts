/**
 * Shared modifier shapes. Kept free of any DB import so client components can use
 * them without dragging drizzle into the browser bundle.
 */

export type PublicModifier = {
  cloverModifierId: string;
  name: string;
  /** Extra charge in dollars. */
  price: number;
};

export type PublicModifierGroup = {
  cloverModifierGroupId: string;
  name: string;
  /** Null means "no minimum" — anything >= 1 makes the group a required choice. */
  minRequired: number | null;
  /** Null means unlimited. */
  maxAllowed: number | null;
  showByDefault: boolean;
  modifiers: PublicModifier[];
};

/** A group where exactly one option is picked behaves as radios, not checkboxes. */
export function isSingleChoice(group: PublicModifierGroup) {
  return group.maxAllowed === 1;
}

export function isRequired(group: PublicModifierGroup) {
  return (group.minRequired ?? 0) > 0;
}

/**
 * Toggle a modifier within its group's rules.
 * - single-choice groups replace the current pick (and allow un-picking when optional)
 * - multi-choice groups refuse to exceed `maxAllowed`
 */
export function toggleModifier(
  group: PublicModifierGroup,
  selected: string[],
  modifierId: string,
): string[] {
  const inGroup = new Set(group.modifiers.map((m) => m.cloverModifierId));
  const outside = selected.filter((id) => !inGroup.has(id));
  const inside = selected.filter((id) => inGroup.has(id));

  if (inside.includes(modifierId)) {
    // Un-picking the only choice in a required group would leave it invalid, but the
    // Add button already blocks that — let it happen so the customer can switch.
    return [...outside, ...inside.filter((id) => id !== modifierId)];
  }
  if (isSingleChoice(group)) return [...outside, modifierId];
  if (group.maxAllowed != null && inside.length >= group.maxAllowed) return selected;
  return [...outside, ...inside, modifierId];
}

/** Groups whose `minRequired` is not yet satisfied. Empty means the line can be added. */
export function unsatisfiedGroups(
  groups: PublicModifierGroup[],
  selected: string[],
): PublicModifierGroup[] {
  const chosen = new Set(selected);
  return groups.filter((g) => {
    const count = g.modifiers.filter((m) => chosen.has(m.cloverModifierId)).length;
    return count < (g.minRequired ?? 0);
  });
}

/** Resolve ids to modifiers, preserving group order so the cart reads sensibly. */
export function selectedModifiersOf(
  groups: PublicModifierGroup[],
  selected: string[],
): PublicModifier[] {
  const chosen = new Set(selected);
  return groups.flatMap((g) => g.modifiers.filter((m) => chosen.has(m.cloverModifierId)));
}

export function modifierExtraPrice(groups: PublicModifierGroup[], selected: string[]) {
  return selectedModifiersOf(groups, selected).reduce((s, m) => s + m.price, 0);
}

/** Pre-select the single option of a required single-choice group with only one choice. */
export function defaultSelection(groups: PublicModifierGroup[]): string[] {
  return groups
    .filter((g) => isRequired(g) && isSingleChoice(g) && g.modifiers.length === 1)
    .map((g) => g.modifiers[0].cloverModifierId);
}
