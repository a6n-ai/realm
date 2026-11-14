/** "unit - line, city, postal" with missing parts left out. */
export function formatAddressLine(a: { addressUnit?: string | null; addressLine?: string | null; city?: string | null; postalCode?: string | null }): string {
  return [a.addressUnit ? `${a.addressUnit} - ${a.addressLine}` : a.addressLine, a.city, a.postalCode].filter(Boolean).join(", ");
}
