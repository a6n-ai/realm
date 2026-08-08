/**
 * App-injected persistence for the shared plugin config blob (JSONB on the
 * tenant row). Every plugin package takes this; none imports an app or a DB.
 * `.loose()` parsing on the app side is what lets plugins coexist in one blob.
 */
export type IntegrationsConfigStore<T = Record<string, unknown>> = {
  get(): Promise<T>;
  set(cfg: T): Promise<void>;
};
