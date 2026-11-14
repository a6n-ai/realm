import { describe, expect, it } from "vitest";
import { IMPORT_FIELDS, suggestMapping } from "../import-columns";

describe("suggestMapping whatsapp", () => {
  it("maps a WhatsApp header to whatsappPhone, not phone", () => {
    const { fields } = suggestMapping(["Name", "Phone", "WhatsApp"]);
    expect(fields.phone).toBe("Phone");
    expect(fields.whatsappPhone).toBe("WhatsApp");
  });

  it("never guesses a WhatsApp Number header as the phone", () => {
    expect(suggestMapping(["Name", "WhatsApp Number"]).fields.phone).not.toBe("WhatsApp Number");
  });

  it("offers WhatsApp Number as an optional field", () => {
    expect(IMPORT_FIELDS.find((f) => f.key === "whatsappPhone")).toEqual({ key: "whatsappPhone", label: "WhatsApp Number", required: false });
  });
});
