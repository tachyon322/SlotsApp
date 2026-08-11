'use client';

import { useMinedropGame } from '@/hooks/useMinedropGame';
import { MineDropStage } from '@/components/minedrop/MineDropStage';
import { MineDropControls } from '@/components/minedrop/MineDropControls';
import { MineDropRulesSheet } from '@/components/minedrop/MineDropRulesSheet';
import { MineDropReceiptModal } from '@/components/minedrop/MineDropReceiptModal';
import { MineDropHistory } from '@/components/minedrop/MineDropHistory';
import { PRESETS } from '@/lib/minedrop/engine';

export default function MineDropPage() {
  const game = useMinedropGame();
  const s = game.state;

  const stepBet = (delta: 1 | -1) => {
    const idx = PRESETS.indexOf(s.betAmount);
    if (idx === -1) return;
    const next = PRESETS[idx + delta];
    if (next !== undefined) game.actions.setBetAmount(next);
  };

  return (
    <main className="px-page max-[399px]:px-xs md:px-2xl pt-2 md:pt-4 pb-8 w-full">
      <div className="mx-auto max-w-5xl">
        <div className="minedrop_shell">
          <div className="minedrop_layout">
            <div className="minedrop_main">
              <MineDropStage
                phase={s.phase}
                reels={s.reels}
                reelState={s.reelState}
                destroyed={s.destroyed}
                jackpots={s.jackpots}
                payout={s.payout}
                betAmount={s.betAmount}
                multiplier={s.result?.multiplier ?? 0}
                outcome={s.outcome}
              />
              <MineDropControls
                phase={s.phase}
                betAmount={s.betAmount}
                canReceipt={s.phase === 'resolved' && s.receipt !== null}
                onBet={game.actions.setBetAmount}
                onStep={stepBet}
                onPrimary={() => {
                  if (s.phase === 'resolved') {
                    game.actions.playAgain();
                  } else {
                    void game.actions.startGame();
                  }
                }}
                onReceipt={game.actions.openReceipt}
                onRules={game.actions.openRules}
              />
            </div>
            <MineDropHistory history={s.history} />
          </div>
        </div>
      </div>

      <MineDropRulesSheet open={s.rulesOpen} onClose={game.actions.closeRules} />
      <MineDropReceiptModal
        open={s.receiptOpen}
        onClose={game.actions.closeReceipt}
        receipt={s.receipt}
      />
    </main>
  );
}
