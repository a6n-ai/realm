import { describe, it, expect } from "vitest";
import pino from "pino";
import { loggerOptions } from "./logger";

describe("logger", () => {
  it("emits JSON with string level and redacts secrets", () => {
    let out = "";
    const stream = { write: (s: string) => void (out += s) };
    const log = pino({ ...loggerOptions, level: "debug" }, stream).child({ name: "test" });

    log.info({ password: "hunter2", pin: "1234", userId: 7 }, "hello");

    const rec = JSON.parse(out);
    expect(rec.level).toBe("info");
    expect(rec.name).toBe("test");
    expect(rec.msg).toBe("hello");
    expect(rec.userId).toBe(7);
    expect(rec.password).toBe("[redacted]");
    expect(rec.pin).toBe("[redacted]");
  });
});
