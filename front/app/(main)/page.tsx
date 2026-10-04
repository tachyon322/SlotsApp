import { MetricsStrip } from "@/components/lobby/MetricsStrip";
import { FeaturedArena } from "@/components/lobby/FeaturedArena";
import { PulseStrip } from "@/components/lobby/PulseStrip";
import { ActionDock } from "@/components/lobby/ActionDock";
import { EngagementDeck } from "@/components/lobby/EngagementDeck";
import { GameLibrary } from "@/components/lobby/GameLibrary";
import { RefundStatusCard } from "@/components/RefundStatusCard";

export default function HomePage() {
  return (
    <div className="ref-home">
      <h1 className="ref-visuallyHidden">Игровое лобби LITGAME</h1>

      <RefundStatusCard />
      <MetricsStrip />
      <FeaturedArena />
      <PulseStrip />
      <ActionDock />
      <EngagementDeck />
      <GameLibrary />
    </div>
  );
}
