/**
 * Real Scarborough/Toronto addresses for `scripts/compare-providers.ts`.
 * Not used by the vitest suite — this file backs a manual comparison script,
 * kept in __tests__/fixtures for discoverability alongside the other test data.
 */
export type CanadianAddressCase = {
  /** Short label for table output. */
  label: string;
  /** Full address as a customer would type it. */
  address: string;
  /**
   * Substring (e.g. "802", "Unit 4") that MUST survive into a resolved
   * formattedAddress for this case to count as "unit preserved". Only set on
   * cases that actually carry a unit/apartment number.
   */
  expectedUnitFragment?: string;
  note: string;
};

export const CANADIAN_ADDRESS_FIXTURES: CanadianAddressCase[] = [
  {
    label: "Shop control",
    address: "3315 Danforth Ave, Toronto, ON M1L 1C1",
    note: "the shop's own address — both providers must resolve this cleanly",
  },
  {
    label: "Apt number",
    address: "1265 Military Trail, Apt 802, Scarborough, ON M1B 5M8",
    expectedUnitFragment: "802",
    note: "unit case — the bug this fixture exists to catch",
  },
  {
    label: "Unit number",
    address: "2 Falaise Rd, Unit 4, Scarborough, ON M1B 2Z1",
    expectedUnitFragment: "4",
    note: "unit case, 'Unit' spelled out",
  },
  {
    label: "Hash unit",
    address: "25 Silver Springs Blvd, #12, Scarborough, ON M1V 1L4",
    expectedUnitFragment: "12",
    note: "unit case, '#' shorthand",
  },
  {
    label: "High-rise apt",
    address: "4001 Sheppard Ave E, Apt 1503, Scarborough, ON M1S 1S6",
    expectedUnitFragment: "1503",
    note: "unit case, 4-digit apartment number in a highrise",
  },
  {
    label: "Suite number",
    address: "3450 Sheppard Ave E, Suite 200, Scarborough, ON M1T 3K1",
    expectedUnitFragment: "200",
    note: "unit case, commercial 'Suite'",
  },
  {
    label: "Mall",
    address: "300 Borough Dr, Scarborough, ON M1P 4P5",
    note: "Scarborough Town Centre — plaza/mall address, no unit",
  },
  {
    label: "PO box",
    address: "PO Box 512, Scarborough, ON M1K 5C3",
    note: "PO-box style address — neither provider is expected to geocode this precisely",
  },
  {
    label: "Misspelled street",
    address: "3315 Danfourth Ave, Toronto, ON",
    note: "misspelling of the control address ('Danfourth' for 'Danforth')",
  },
  {
    label: "Plain civic (Kennedy)",
    address: "2280 Kennedy Rd, Scarborough, ON M1T 3G8",
    note: "no unit, control for a busy arterial road",
  },
  {
    label: "Unit on arterial",
    address: "2280 Kennedy Rd, Unit 15, Scarborough, ON M1T 3G8",
    expectedUnitFragment: "15",
    note: "same building as above, with a unit added",
  },
  {
    label: "Plain civic (Sandhurst)",
    address: "1571 Sandhurst Circle, Scarborough, ON M1V 1V2",
    note: "residential, no unit",
  },
  {
    label: "Business court",
    address: "10 Milner Business Ct, Scarborough, ON M1B 3C6",
    note: "commercial civic address, no unit",
  },
  {
    label: "Apt on Rylander",
    address: "61 Rylander Blvd, Apt 305, Scarborough, ON M1B 5M9",
    expectedUnitFragment: "305",
    note: "unit case, residential mid-rise",
  },
  {
    label: "Corporate drive",
    address: "8 Corporate Dr, Scarborough, ON M1H 3G5",
    note: "office park civic address, no unit",
  },
];
