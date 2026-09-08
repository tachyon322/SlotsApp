'use client';

import { useSlotsGame } from '@/hooks/useSlotsGame';
import { SlotsTabs } from '@/components/slots/SlotsTabs';
import { SlotsPanel } from '@/components/slots/SlotsPanel';
import { SlotsMachine } from '@/components/slots/SlotsMachine';
import { SlotsCta } from '@/components/slots/SlotsCta';
import { SlotsRulesModal } from '@/components/slots/SlotsRulesModal';
import { SlotsHistory } from '@/components/slots/SlotsHistory';
import { useUser } from '@/components/UserProvider';
import { Zap } from 'lucide-react';

export default function SlotsPage() {
  const game = useSlotsGame();
  const { user } = useUser();
  const s = game.state;

  const insufficient = !!user && user.balance < s.totalBet;
  const isMega = s.mode === 'mega';

  return (
    <div className="sl-shell">
      <div className="sl-content slv2-content" data-mode={s.mode}>
        <span className="slv2-environment" aria-hidden="true" />

        <header className="slv2-hero" data-mode={s.mode}>
          <span className="slv2-heroIcon" aria-hidden="true">
            <Zap aria-hidden="true" />
          </span>
          <span className="slv2-heroCopy">
            <span className="slv2-eyebrow">LITGAME ORIGINAL</span>
            <span className="slv2-heroTitle">{isMega ? 'Мега-Слоты' : 'Слоты'}</span>
            <span className="slv2-heroSubtitle">
              {isMega ? 'Больше символов, больше комбинаций' : 'Классические линии 3×3'}
            </span>
          </span>
        </header>

        <section className="slv2-gameStage" aria-label="Игровой автомат">
          <SlotsTabs
            mode={s.mode}
            disabled={s.spinning}
            onModeChange={game.actions.setMode}
          />

          <SlotsPanel
            mode={s.mode}
            activeLines={s.activeLines}
            lineBet={s.lineBet}
            totalBet={s.totalBet}
            disabled={s.spinning}
            onActiveLinesChange={game.actions.setActiveLines}
            onLineBetChange={game.actions.setLineBet}
          />

          <SlotsMachine
            mode={s.mode}
            grid={s.grid}
            spinning={s.spinning}
            settledColumns={s.settledColumns}
            winLines={s.winLines}
            winningCoords={s.winningCoords}
            outcome={s.outcome}
          />

          <SlotsCta
            totalBet={s.totalBet}
            spinning={s.spinning}
            insufficient={insufficient}
            onSpin={() => void game.actions.spin()}
            onOpenRules={() => game.actions.setIsRulesOpen(true)}
          />
        </section>

        <SlotsHistory history={s.history} stats={s.stats} />
      </div>

      <SlotsRulesModal
        open={s.isRulesOpen}
        onClose={() => game.actions.setIsRulesOpen(false)}
      />
    </div>
  );
}
