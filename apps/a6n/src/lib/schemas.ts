import { setResponseStatus } from "@tanstack/react-start/server";
import type { z } from "zod";

// Only .validator() calls use this. A failed parse is a 400 with a fixed message; issue paths are logged, never values.
export const validate =
  <T extends z.ZodType>(schema: T) =>
  (raw: unknown): z.output<T> => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      setResponseStatus(400);
      console.error(`invalid input at ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}:${i.code}`).join(", ")}`);
      throw new Error("invalid input");
    }
    return parsed.data;
  };
