import { HeroSlider } from "@/components/lobby/HeroSlider";
import { PromoCard } from "@/components/lobby/PromoCard";
import { LiveFeed } from "@/components/lobby/LiveFeed";
import { GameCatalog } from "@/components/lobby/GameCatalog";
import { CaseDrops } from "@/components/lobby/CaseDrops";
import { TopPlayers } from "@/components/lobby/TopPlayers";
import { RefundStatusCard } from "@/components/RefundStatusCard";

export default function HomePage() {
  return (
    <div className="lg-home">
      <h1 className="lg-sr">Игровое лобби LITGAME</h1>

      <RefundStatusCard />
      <section className="lg-hero" aria-label="Главная игра">
        <HeroSlider />
        <PromoCard />
      </section>
      <LiveFeed />
      <GameCatalog />
      <CaseDrops />
      <TopPlayers />
    </div>
  );
}
