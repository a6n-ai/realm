import { SITE_NAME, SITE_PITCH, SITE_TAGLINE } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";
import { HomeHero } from "@/components/marketing/home-hero";
import { HomeWho } from "@/components/marketing/home-who";
import { HomeBoard } from "@/components/marketing/home-board";
import { HomeMethod } from "@/components/marketing/home-method";
import { HomeBench } from "@/components/marketing/home-bench";
import { HomeComeAs } from "@/components/marketing/home-come-as";
import { HomeRemember } from "@/components/marketing/home-remember";
import { HomeTeams } from "@/components/marketing/home-teams";
import { HomeClose } from "@/components/marketing/home-close";

export const metadata = buildMetadata({
  title: `${SITE_NAME} · ${SITE_TAGLINE}`,
  description: SITE_PITCH,
  path: "/",
});

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <HomeWho />
      <HomeBoard />
      <HomeMethod />
      <HomeBench />
      <HomeComeAs />
      <HomeRemember />
      <HomeTeams />
      <HomeClose />
    </>
  );
}
