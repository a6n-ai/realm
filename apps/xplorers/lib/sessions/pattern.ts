/** Stub for Task 4; the schema only needs the type. */
export type RepeatPattern = {
  /** 1 = Mon .. 7 = Sun */
  weekdays: number[];
  nthOfMonth: number[] | null;
  startClock: string;
  endClock: string;
  startsOn: string;
  endsOn: string | null;
  excludeMonths: number[];
};
