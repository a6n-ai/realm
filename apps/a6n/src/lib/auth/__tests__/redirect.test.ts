import { expect, test } from "vitest";
import { safeRedirect } from "../redirect";

test.each([
  ["//evil", "/inquiries"],
  ["/\\evil", "/inquiries"],
  ["/\t/evil", "/inquiries"],
  ["https://x", "/inquiries"],
  ["/%2f%2fx", "/inquiries"],
  ["/inquiries?a=1", "/inquiries?a=1"],
  [undefined, "/inquiries"],
  [42, "/inquiries"],
  [null, "/inquiries"],
])("safeRedirect(%j) -> %s", (input, out) => {
  expect(safeRedirect(input)).toBe(out);
});
