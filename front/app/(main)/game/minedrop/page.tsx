'use client';

import { useMinedropGame } from '@/hooks/useMinedropGame';
import { MineDropStage } from '@/components/minedrop/MineDropStage';
import { MineDropControls } from '@/components/minedrop/MineDropControls';
import { MineDropRulesSheet } from '@/components/minedrop/MineDropRulesSheet';
import { MineDropReceiptModal } from '@/components/minedrop/MineDropReceiptModal';
import { MineDropHistory } from '@/components/minedrop/MineDropHistory';
import { PRESETS, formatRub } from '@/lib/minedrop/engine';

export default function MineDropPage() {
  const game = useMinedropGame();
  const s = game.state;

  const stepBet = (delta: 1 | -1) => {
    const idx = PRESETS.indexOf(s.betAmount);
    if (idx === -1) return;
    const next = PRESETS[idx + delta];
    if (next !== undefined) game.actions.setBetAmount(next);
  };

  const showHud = s.phase !== 'idle' && s.round !== null;

  return (
    <div className="md-shell" data-variant="minedrop">
      <div className="md-gameSurface">
        <header className="md-gameHeader">
          <div>
            <span className="md-eyebrow">LITGAME ORIGINAL</span>
            <h1 className="md-title">MineDrop</h1>
            <p className="md-subtitle">
              Случайный инструмент падает в шахту и крушит блоки, пока не сломается — руда приносит выигрыш
            </p>
          </div>
          <span className="md-heroArt" aria-hidden="true" />
        </header>

        <div className="md-gameLayout">
          <div className="md-mainColumn">
            <section className="md-stage" aria-label="MineDrop">
              <div className="md-board">
                <MineDropStage
                  round={s.round}
                  runKey={s.runKey}
                  rubPerUnit={s.rubPerUnit}
                  turbo={s.turbo}
                  onProgress={game.actions.onProgress}
                  onDone={game.actions.onDone}
                />

                {showHud && (
                  <div className="md-hud" aria-live="polite">
                    <span className="md-hudTool">
                      <img alt="" src={s.round!.tool.image} className="md-hudToolImg" />
                      {s.round!.tool.label}
                    </span>
                    <span className="md-hudWin" data-active={s.liveWin > 0 ? 'true' : undefined}>
                      {formatRub(s.liveWin)}
                    </span>
                  </div>
                )}

                {s.phase === 'resolved' && (
                  <div className="md-result" data-outcome={s.outcome ?? 'loss'}>
                    <span className="md-resultLabel">
                      {s.payout > 0 ? 'Выигрыш' : 'Инструмент сломан'}
                    </span>
                    <span className="md-resultAmount">{formatRub(s.payout)}</span>
                    <span className="md-resultMultiplier">×{s.multiplier.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </section>

            <MineDropControls
              phase={s.phase}
              betAmount={s.betAmount}
              turbo={s.turbo}
              canReceipt={s.phase === 'resolved' && s.receipt !== null}
              onBet={game.actions.setBetAmount}
              onStep={stepBet}
              onPrimary={() => void game.actions.startGame()}
              onTurbo={game.actions.toggleTurbo}
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
      <MineDropReceiptModal open={s.receiptOpen} onClose={game.actions.closeReceipt} receipt={s.receipt} />
    </div>
  );
}
