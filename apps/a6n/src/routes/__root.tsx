import { ConsoleRouterProvider } from "@foundry/console/router";
import { Toaster } from "@foundry/ui/toast";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { tanstackConsoleRouter } from "../components/router-adapter";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "a6n" }],
    links: [{ rel: "icon", href: "/icon.svg", type: "image/svg+xml" }, { rel: "stylesheet", href: appCss }],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="admin-ui">
        <ConsoleRouterProvider router={tanstackConsoleRouter}>
          <Outlet />
          <Toaster />
        </ConsoleRouterProvider>
        <Scripts />
      </body>
    </html>
  ),
  notFoundComponent: () => (
    <main className="mx-auto grid max-w-sm gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">It does not exist or has moved.</p>
      <Link to="/" className="text-primary underline">
        Back to a6n
      </Link>
    </main>
  ),
});
