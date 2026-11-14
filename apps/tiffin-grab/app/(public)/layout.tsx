import "@/app/styles/app.css";
import type { ReactNode } from "react";
import { AppCurrencyProvider } from "@/components/app-currency";
import { MotionProvider } from "@/components/motion/motion-provider";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { getAppSettings } from "@/lib/settings";

// Subscribe and checkout animate with motion; the landing and marketing pages don't, so
// the provider lives here and in the app areas rather than in the root layout.
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const { currency, timezone } = await getAppSettings();
  return (
    <AppCurrencyProvider currency={currency}>
      <TimezoneProvider tz={timezone}>
        <MotionProvider>
          {children}
        </MotionProvider>
      </TimezoneProvider>
    </AppCurrencyProvider>
  );
}
