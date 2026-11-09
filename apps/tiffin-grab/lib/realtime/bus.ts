import { pickBus } from "@foundry/realtime/server";
import { realtimeConfigFromEnv } from "@foundry/realtime/server";

const cfg = realtimeConfigFromEnv();
export const realtimeBus = pickBus(cfg ? { REALTIME_URL: cfg.url, REALTIME_SECRET: cfg.secret } : {});
