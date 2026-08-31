import { z } from "zod";

// A straight run (ascending or descending) of any 4 consecutive digits is a
// substring of these; four-of-a-kind is caught by the backreference. Everything
// else is allowed — this is a convenience PIN, not a password.
export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, "PIN must be exactly 4 digits")
  .refine(
    (p) =>
      !/^(\d)\1{3}$/.test(p) &&
      !"0123456789".includes(p) &&
      !"9876543210".includes(p),
    "Avoid an easily guessed PIN like 1234, 0000, or 4321",
  );
