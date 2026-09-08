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
    <div className="md-shell" data-variant="minedrop">
      <div className="md-gameSurface">
        <header className="md-gameHeader">
          <div>
            <span className="md-eyebrow">LITGAME ORIGINAL</span>
            <h1 className="md-title">MineDrop</h1>
            <p className="md-subtitle">
              Инструменты падают сверху и крушат блоки — чем глубже, тем дороже
            </p>
          </div>
          <span className="md-heroArt" aria-hidden="true" />
        </header>

        <div className="md-gameLayout">
          <div className="md-mainColumn">
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
          <aside className="md-sideColumn" aria-label="История MineDrop">
            <MineDropHistory history={s.history} />
          </aside>
        </div>
      </div>

      <MineDropRulesSheet open={s.rulesOpen} onClose={game.actions.closeRules} />
      <MineDropReceiptModal
        open={s.receiptOpen}
        onClose={game.actions.closeReceipt}
        receipt={s.receipt}
      />
    </div>
  );
}
