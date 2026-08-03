import { AnimReady } from "@/components/brutal/anim-ready";
import { Footer, Nav } from "@/components/brutal/chrome";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartProvider } from "@/components/cart/cart-provider";
import { isPublicOrderingEnabled } from "@/lib/clover/public-ordering";

// Ordering is gated on the persisted Clover connection, so this layout reads the
// DB — and the CI Docker build has no Postgres, so prerendering any page under it
// crashes (same wall `/eats` hit). Static prerender would be wrong anyway: it
// bakes today's orderingEnabled into every marketing page, so connecting Clover
// later would leave the cart hidden until the next deploy.
export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const orderingEnabled = await isPublicOrderingEnabled();

  return (
    <CartProvider orderingEnabled={orderingEnabled}>
      <AnimReady />
      <Nav />
      <main id="main">{children}</main>
      <Footer />
      {orderingEnabled ? <CartDrawer /> : null}
    </CartProvider>
  );
}
