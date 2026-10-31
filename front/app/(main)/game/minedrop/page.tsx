'use client';

import { useState } from 'react';
import { useMinedropGame } from '@/hooks/useMinedropGame';
import { MineDropStage } from '@/components/minedrop/MineDropStage';
import { MineDropControls } from '@/components/minedrop/MineDropControls';
import { MineDropRulesSheet } from '@/components/minedrop/MineDropRulesSheet';
import { MineDropReceiptModal } from '@/components/minedrop/MineDropReceiptModal';
import { MineDropHistory } from '@/components/minedrop/MineDropHistory';
import type { RoundView } from '@/components/minedrop/art';

export default function MineDropPage() {
  const game = useMinedropGame();
  const s = game.state;
  // Чек раунда из истории (чек текущего раунда — из хука).
  const [historyRound, setHistoryRound] = useState<RoundView | null>(null);

  const currentRound: RoundView | null =
    s.receiptOpen && s.receipt
      ? {
          bet: s.receipt.bet,
          multiplier: s.receipt.multiplier,
          payout: s.receipt.payout,
          outcome: s.receipt.outcome,
          columns: s.receipt.result.columns.map((c) => ({
            slots: c.slots,
            points: c.multiplier,
            destroyed: c.destroyed,
            jackpot: c.jackpot,
          })),
        }
      : null;

  return (
    <div className="md2-page" data-phase={s.phase}>
      <h1 className="sr-only">MineDrop</h1>

      <div className="md2-play">
        <MineDropStage
          phase={s.phase}
          reels={s.reels}
          reelState={s.reelState}
          destroyed={s.destroyed}
          jackpots={s.jackpots}
          payout={s.payout}
          betAmount={s.betAmount}
          multiplier={s.multiplier}
          outcome={s.outcome}
        />
        <div className="md2-side">
          <MineDropControls
            phase={s.phase}
            betAmount={s.betAmount}
            canReceipt={s.phase === 'resolved' && s.receipt !== null}
            onBet={game.actions.setBetAmount}
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
          <MineDropHistory history={s.history} onOpen={setHistoryRound} />
        </div>
      </div>

      <MineDropRulesSheet open={s.rulesOpen} onClose={game.actions.closeRules} />
      <MineDropReceiptModal round={currentRound} onClose={game.actions.closeReceipt} />
      <MineDropReceiptModal round={historyRound} onClose={() => setHistoryRound(null)} />
    </div>
  );
}
