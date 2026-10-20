/** Whole calendar years on `onDate`. A Feb 29 birthday counts as Mar 1 in non-leap years. */
export function ageOn(dateOfBirth: string, onDate: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = onDate.split("-").map(Number) as [number, number, number];
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

export function checkAge(
  cls: { ageMin: number | null; ageMax: number | null; ageWaiver: boolean },
  age: number,
): "ok" | "waiver" | "blocked" {
  const inRange = (cls.ageMin === null || age >= cls.ageMin) && (cls.ageMax === null || age <= cls.ageMax);
  if (inRange) return "ok";
  return cls.ageWaiver ? "waiver" : "blocked";
}
