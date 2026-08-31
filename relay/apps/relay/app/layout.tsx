import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider, themeInitScript } from "@foundry/themes";
import { Toaster } from "@foundry/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay",
  description: "Multi-channel notification platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
