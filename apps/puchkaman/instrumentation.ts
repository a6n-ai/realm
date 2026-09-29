export async function register() {
  // Opt-in, so builds, tests and scripts never start a long-lived Redis wait.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NOTIFY_LISTENER === "on") {
    const { startOutboxListener } = await import("./lib/notifications/outbox-listener");
    startOutboxListener();
  }
}
