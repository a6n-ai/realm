import { pickBus } from "@foundry/realtime/server";
import { realtimeConfig } from "./config";

const cfg = realtimeConfig();
export const realtimeBus = pickBus(cfg ? { REALTIME_URL: cfg.url, REALTIME_SECRET: cfg.secret } : {});
