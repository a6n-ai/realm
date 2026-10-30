import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { AreaTransition } from "@/components/motion/page-transition";
import { Poppins } from "next/font/google";
import { geistSans, geistMono, geistPixelCircle } from "./fonts";
import { ThemeProvider, themeInitScript } from "@foundry/themes";
import { InlineScript } from "@/components/inline-script";
import { Toaster } from "@foundry/ui/sonner";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { StaleDeployReloader } from "@/components/stale-deploy-reloader";
import { NavPending } from "@/components/landing/nav-pending";
import { BrowserChrome } from "@/components/browser-chrome";
import "./globals.css";

// Runtime env (not NEXT_PUBLIC_): NEXT_PUBLIC_* is inlined at `next build`, so an
// empty CI bake would ignore the SSM value. Root layout is a Server Component —
// it reads this at request time and passes gaId into <GoogleAnalytics /> as a prop.
const gaId = process.env.GA_MEASUREMENT_ID?.trim();

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

// Geist faces come from the `geist` npm package's files but are declared in
// ./fonts with preload: false — see there. GeistMono is the app-wide mono;
// --font-geist-sans is scoped to the dashboard shell only (.crm-app in
// globals.css) — public/customer pages keep Poppins.

// Absolute URLs for canonical and share-card tags; SITE_URL is the deployed origin.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://app.tiffingrab.ca"),
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
      className={`${poppins.variable} ${geistSans.variable} ${geistMono.variable} ${geistPixelCircle.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={themeInitScript} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider><AreaTransition>{children}</AreaTransition></TooltipProvider>
          <Toaster />
          <StaleDeployReloader />
          <NavPending />
          <BrowserChrome />
        </ThemeProvider>
      </body>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}
