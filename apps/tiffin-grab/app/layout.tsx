import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelCircle } from "geist/font/pixel";
import { ThemeProvider, themeInitScript } from "@realm/themes";
import { InlineScript } from "@/components/inline-script";
import { Toaster } from "@realm/ui/sonner";
import { TooltipProvider } from "@realm/ui/tooltip";
import { StaleDeployReloader } from "@/components/stale-deploy-reloader";
import "./globals.css";

// Rounded, friendly sans — swapped in for the previous neutral/system-feeling Geist Sans
// specifically so headers, dish names, and the wallet balance read as a warm consumer food
// app rather than a B2B dashboard. Only 400/500/600/700 are loaded (Regular/Medium for body
// and metadata, SemiBold/Bold for headers and "personality" numbers) — Poppins ships as
// discrete static weight files, not a variable font, so next/font/google needs the exact
// weight list rather than a range.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Self-hosted via the `geist` npm package (Vercel's own font, full glyph set +
// font-feature-settings) rather than next/font/google. GeistMono is the app-wide
// mono; GeistSans's --font-geist-sans is scoped to the dashboard shell only
// (.crm-app in globals.css) — public/customer pages keep Poppins.

export const metadata: Metadata = {
  title: "Tiffin Grab",
  description: "Customizable tiffin subscriptions across the GTA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${GeistSans.variable} ${GeistMono.variable} ${GeistPixelCircle.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={themeInitScript} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
          <StaleDeployReloader />
        </ThemeProvider>
      </body>
    </html>
  );
}
