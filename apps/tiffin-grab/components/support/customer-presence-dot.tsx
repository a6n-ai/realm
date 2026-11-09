"use client";

import { PresenceDot } from "@foundry/design-system";
import { usePresence } from "@foundry/realtime/client";

export function CustomerPresenceDot({ channel }: { channel: string }) {
  return <PresenceDot online={usePresence(channel, "customer")} label="Customer" />;
}
