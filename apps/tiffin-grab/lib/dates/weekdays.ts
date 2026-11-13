import { WEEK_DAYS, type DayOfWeek } from "@/db/schema/enums";

export { WEEK_DAYS, type DayOfWeek };

export const DAY_NAME: Record<DayOfWeek, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};

export const DAY_SHORT: Record<DayOfWeek, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

/** Indexed like Date#getDay(): 0 is Sunday. */
export const DAY_BY_JS_INDEX: readonly DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
