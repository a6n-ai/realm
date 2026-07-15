import { AnimReady } from "@/components/brutal/anim-ready";
import { Footer, Nav } from "@/components/brutal/chrome";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnimReady />
      <Nav />
      <main>{children}</main>
      <Footer />
    </>
  );
}
