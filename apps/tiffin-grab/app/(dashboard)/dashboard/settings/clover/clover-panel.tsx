"use client";

import type { ComponentProps } from "react";
import { CloverSettingsPanel } from "@foundry/clover/ui";
import { ActionError, unwrapAction } from "@/lib/actions/unwrap";
import {
  connectCloverApiTokenAction,
  disconnectCloverAction,
  startCloverConnectAction,
} from "../integrations/clover-actions";

type Props = Omit<ComponentProps<typeof CloverSettingsPanel>, "onConnect" | "onDisconnect" | "onConnectApiToken">;

// The panel expects its handlers to throw or return its own result shape; the actions return a refusal instead.
export function CloverPanel(props: Props) {
  return (
    <CloverSettingsPanel
      {...props}
      onConnect={async () => (await unwrapAction(startCloverConnectAction())).url}
      onDisconnect={async () => {
        await unwrapAction(disconnectCloverAction());
      }}
      onConnectApiToken={async (input) => {
        try {
          await unwrapAction(connectCloverApiTokenAction(input));
          return { ok: true };
        } catch (e) {
          if (e instanceof ActionError) return { ok: false, error: e.message };
          throw e;
        }
      }}
    />
  );
}
