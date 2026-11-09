import { isRealDate } from "@foundry/commons/util/dates";

/** The date when `value` is a real YYYY-MM-DD day (rejects 2026-02-30), else null. For search params and form input. */
export const parseIsoDate = (value: string | null | undefined): string | null => (value != null && isRealDate(value) ? value : null);
