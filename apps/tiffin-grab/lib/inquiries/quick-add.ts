// A quick add is a lead whose name was generated and not yet replaced. Decided by the
// stored lead_number, never by the name text: a person typed in as "Lead 5" is not one.
export function generatedLeadName(n: number): string {
  return `Lead ${n}`;
}

export function isQuickAdd(i: { leadNumber: number | null; fullName: string | null }): boolean {
  return i.leadNumber != null && i.fullName === generatedLeadName(i.leadNumber);
}
