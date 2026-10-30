'use client';

import { useSlotsGame } from '@/hooks/useSlotsGame';
import { SlotsTabs } from '@/components/slots/SlotsTabs';
import { SlotsPanel } from '@/components/slots/SlotsPanel';
import { SlotsMachine } from '@/components/slots/SlotsMachine';
import { SlotsCta } from '@/components/slots/SlotsCta';
import { SlotsRulesModal } from '@/components/slots/SlotsRulesModal';
import { SlotsHistory } from '@/components/slots/SlotsHistory';
import { useUser } from '@/components/UserProvider';

export default function SlotsPage() {
  const game = useSlotsGame();
  const { user } = useUser();
  const s = game.state;

  const insufficient = !!user && user.balance < s.totalBet;

  return (
    <div className="sg-page" data-mode={s.mode}>
      <h1 className="sr-only">{s.mode === 'mega' ? 'Мега-слоты' : 'Слоты'}</h1>

      <div className="sg-play">
        <div className="sg-stage">
          <SlotsTabs
            mode={s.mode}
            disabled={s.spinning}
            onModeChange={game.actions.setMode}
            onOpenRules={() => game.actions.setIsRulesOpen(true)}
          />
          <SlotsMachine
            mode={s.mode}
            grid={s.grid}
            spinning={s.spinning}
            settledColumns={s.settledColumns}
            activeLines={s.activeLines}
            winLines={s.winLines}
            winningCoords={s.winningCoords}
            outcome={s.outcome}
            payout={s.lastPayout}
            multiplier={s.lastMultiplier}
          />
        </div>

        <div className="sg-side">
          <SlotsPanel
            mode={s.mode}
            activeLines={s.activeLines}
            lineBet={s.lineBet}
            disabled={s.spinning}
            onActiveLinesChange={game.actions.setActiveLines}
            onLineBetChange={game.actions.setLineBet}
          />
          <SlotsCta
            totalBet={s.totalBet}
            spinning={s.spinning}
            insufficient={insufficient}
            onSpin={() => void game.actions.spin()}
          />
        </div>
      </div>

      <SlotsHistory history={s.history} stats={s.stats} />

      <SlotsRulesModal
        open={s.isRulesOpen}
        mode={s.mode}
        onClose={() => game.actions.setIsRulesOpen(false)}
      />
    </div>
  );
}
