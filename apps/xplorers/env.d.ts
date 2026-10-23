declare namespace NodeJS {
  interface ProcessEnv {
    /** Realtime Worker origin; with REALTIME_SECRET switches the bus and browser transport to the Worker. */
    REALTIME_URL?: string;
    REALTIME_SECRET?: string;
  }
}
