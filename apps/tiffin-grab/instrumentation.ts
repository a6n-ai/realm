export async function register() {
  // Long-lived loops can't live in a Worker; its Queue consumer and cron tick replace them.
  // The build-time check lets the bundler drop the imports below from the Workers build.
  if (process.env.BUILD_TARGET === "workers") return;
  // Opt-in, so builds, tests and scripts never start a long-lived Redis wait.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NOTIFY_LISTENER === "on") {
    const { startOutboxListener } = await import("./lib/notifications/outbox-listener");
    startOutboxListener();
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.OPTIMO_EVENTS === "on") {
    const { startOptimoEventPoller } = await import("./lib/services/optimoroute/events");
    startOptimoEventPoller();
  }
}
