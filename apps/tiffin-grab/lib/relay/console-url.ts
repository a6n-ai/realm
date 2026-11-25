/** The console URL Relay returns is sent to the browser to open, so it must sit on the configured Relay origin. */
export function checkConsoleUrl(consoleUrl: string, configuredBase: string | undefined): string {
  const origin = (u: string) => {
    try {
      return new URL(u).origin;
    } catch {
      return null;
    }
  };
  const expected = configuredBase ? origin(configuredBase) : null;
  if (!expected || origin(consoleUrl) !== expected) throw new Error("Relay returned a console URL off the configured origin");
  return consoleUrl;
}
