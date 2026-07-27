import { AnimReady } from "@/components/brutal/anim-ready";
import { Footer, Nav } from "@/components/brutal/chrome";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartProvider } from "@/components/cart/cart-provider";
import { isPublicOrderingEnabled } from "@/lib/clover/public-ordering";

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
