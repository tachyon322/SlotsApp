'use client';

import { useSlotsGame } from '@/hooks/useSlotsGame';
import { SlotsTabs } from '@/components/slots/SlotsTabs';
import { SlotsPanel } from '@/components/slots/SlotsPanel';
import { SlotsMachine } from '@/components/slots/SlotsMachine';
import { SlotsCta } from '@/components/slots/SlotsCta';
import { SlotsRulesModal } from '@/components/slots/SlotsRulesModal';
import { SlotsHistory } from '@/components/slots/SlotsHistory';

export default function SlotsPage() {
  const game = useSlotsGame();

  return (
    <main className="px-page md:px-2xl pt-md md:pt-xl pb-2xl w-full slots_layoutWrapper">
      <div className="mx-auto max-w-5xl">
        <main className="slots_content__9gsyH">
          {game.state.error && (
            <div className="p-3 rounded-button bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold w-full text-center">
              {game.state.error}
            </div>
          )}

          <SlotsTabs
            mode={game.state.mode}
            disabled={game.state.spinning}
            onModeChange={game.actions.setMode}
          />

          <SlotsPanel
            mode={game.state.mode}
            activeLines={game.state.activeLines}
            lineBet={game.state.lineBet}
            totalBet={game.state.totalBet}
            disabled={game.state.spinning}
            onActiveLinesChange={game.actions.setActiveLines}
            onLineBetChange={game.actions.setLineBet}
          />

          <SlotsMachine
            mode={game.state.mode}
            grid={game.state.grid}
            spinning={game.state.spinning}
            settledColumns={game.state.settledColumns}
            winLines={game.state.winLines}
            winningCoords={game.state.winningCoords}
            outcome={game.state.outcome}
          />

          <SlotsCta
            totalBet={game.state.totalBet}
            spinning={game.state.spinning}
            disabled={game.state.spinning}
            onSpin={() => void game.actions.spin()}
            onOpenRules={() => game.actions.setIsRulesOpen(true)}
          />

          <SlotsHistory
            history={game.state.history}
            stats={game.state.stats}
          />
        </main>
      </div>

      <SlotsRulesModal
        open={game.state.isRulesOpen}
        onClose={() => game.actions.setIsRulesOpen(false)}
      />
    </main>
  );
}
