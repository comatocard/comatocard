import { NextSeo } from "next-seo";

import { HomeHero } from "./HomeHero";
import { ShipFaster } from "./ShipFaster";

export const HomePage: React.FC = () => {
  return (
    <>
      <NextSeo
        title={"Comatocard Documentation"}
        description={
          "Programmable payment cards for people and AI agents, enforced by smart contracts on NEAR."
        }
      />

      <HomeHero />

      <ShipFaster />
    </>
  );
};
