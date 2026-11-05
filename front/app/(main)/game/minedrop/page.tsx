'use client';

import { useState } from 'react';
import { useMinedropGame } from '@/hooks/useMinedropGame';
import { MineDropStage } from '@/components/minedrop/MineDropStage';
import { MineDropControls } from '@/components/minedrop/MineDropControls';
import { MineDropRulesSheet } from '@/components/minedrop/MineDropRulesSheet';
import { MineDropReceiptModal } from '@/components/minedrop/MineDropReceiptModal';
import { MineDropHistory } from '@/components/minedrop/MineDropHistory';
import type { RoundView } from '@/components/minedrop/art';
import { formatMultiplier, formatRub } from '@/lib/minedrop/engine';
import { MAX_MULTIPLIER } from '@/lib/minedrop/pickaxeEngine';

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
          tool: s.receipt.round.tool,
          round: s.receipt.round,
        }
      : null;

  const idle = s.phase === 'idle';
  const settled = s.phase === 'resolved' && s.outcome !== null;
  const net = s.payout - s.betAmount;
  const big = settled && s.multiplier >= 5;
  const tool = !idle ? s.round?.tool ?? null : null;

  return (
    <div className="md2-page" data-phase={s.phase}>
      <h1 className="sr-only">MineDrop</h1>

      <div className="md2-play">
        <section className="md2-board" data-phase={s.phase} aria-label="Шахта MineDrop">
          <div className="md2-stats">
            <div>
              <small>Инструмент</small>
              {tool ? (
                <b className="md2-statTool" key={tool.id}>
                  <i style={{ backgroundImage: `url(${tool.image})` }} aria-hidden="true" />
                  <span>{tool.label}</span>
                </b>
              ) : (
                <b data-tone="dim">?</b>
              )}
            </div>
            <div>
              <small>Множитель</small>
              {settled ? (
                <b data-tone={big ? 'gold' : undefined}>{formatMultiplier(s.multiplier)}</b>
              ) : (
                <b data-tone="dim">{idle ? `до ×${MAX_MULTIPLIER}` : '…'}</b>
              )}
            </div>
            <div>
              <small>Выигрыш</small>
              {idle ? (
                <b data-tone="dim">—</b>
              ) : (
                <b
                  data-tone={settled ? (s.outcome === 'win' ? 'pos' : undefined) : s.liveWin > 0 ? 'pos' : 'dim'}
                  key={s.liveWin}
                >
                  {formatRub(s.liveWin)}
                </b>
              )}
            </div>
          </div>

          <div className="md2-card" data-outcome={settled ? s.outcome ?? undefined : undefined} data-big={big || undefined}>
            <div className="md2-mine">
              <MineDropStage
                round={s.round}
                runKey={s.runKey}
                rubPerUnit={s.rubPerUnit}
                turbo={s.turbo}
                onProgress={game.actions.onProgress}
                onDone={game.actions.onDone}
              />
              {settled && (
                <span
                  className="md2-banner"
                  key={s.runKey}
                  data-tone={s.outcome === 'win' ? (big ? 'gold' : 'win') : 'loss'}
                >
                  {net > 0 ? `+${formatRub(net)}` : net < 0 ? `−${formatRub(-net)}` : '±0 ₽'}
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="md2-side">
          <MineDropControls
            phase={s.phase}
            betAmount={s.betAmount}
            turbo={s.turbo}
            canReceipt={s.phase === 'resolved' && s.receipt !== null}
            onBet={game.actions.setBetAmount}
            onPrimary={() => void game.actions.startGame()}
            onTurbo={game.actions.toggleTurbo}
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
