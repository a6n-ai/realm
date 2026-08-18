import type { Metadata } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
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

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
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
