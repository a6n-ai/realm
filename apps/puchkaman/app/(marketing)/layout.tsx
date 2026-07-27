import { AnimReady } from "@/components/brutal/anim-ready";
import { Footer, Nav } from "@/components/brutal/chrome";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartProvider } from "@/components/cart/cart-provider";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <AnimReady />
      <Nav />
      <main id="main">{children}</main>
      <Footer />
      <CartDrawer />
    </CartProvider>
  );
}
