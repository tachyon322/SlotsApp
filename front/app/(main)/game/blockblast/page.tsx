'use client';

import { useState } from 'react';
import { useBlockBlastGame } from '@/hooks/useBlockBlastGame';
import { BlockBlastBoard, type FillZone } from '@/components/blockblast/BlockBlastBoard';
import { BlockBlastControls } from '@/components/blockblast/BlockBlastControls';
import { BlockBlastHistory } from '@/components/blockblast/BlockBlastHistory';
import { BlockBlastModal } from '@/components/blockblast/BlockBlastModal';
import { BlockBlastRules } from '@/components/blockblast/BlockBlastRules';
import { useUser } from '@/components/UserProvider';
import { boardFilledCount, GRID_SIZE } from '@/lib/blockblast/engine';

// Зона риска по заполнению поля (рамка поля и кнопка кэшаута). Пороги: ~1/3, ~1/2 и ~2/3 клеток из 64.
function fillZone(filled: number): FillZone {
  if (filled >= (GRID_SIZE * GRID_SIZE * 2) / 3) return 'critical';
  if (filled >= (GRID_SIZE * GRID_SIZE) / 2) return 'danger';
  if (filled >= (GRID_SIZE * GRID_SIZE) / 3) return 'rising';
  return null;
}

export default function BlockBlastPage() {
  const game = useBlockBlastGame();
  const { user } = useUser();
  const s = game.state;
  const [rulesOpen, setRulesOpen] = useState(false);

  const zone = s.phase === 'playing' ? fillZone(boardFilledCount(s.board)) : null;

  return (
    <div className="bx-page" data-phase={s.phase}>
      <h1 className="sr-only">BlockBlast</h1>

      <div className="bx-play">
        <BlockBlastBoard
          phase={s.phase}
          board={s.board}
          palette={s.palette}
          placements={s.placements}
          multiplier={s.multiplier}
          take={s.take}
          betAmount={s.betAmount}
          lineBonusTotal={s.lineBonusTotal}
          timer={s.timer}
          timerLevel={s.timerLevel}
          clearing={s.clearing}
          selectedSlot={s.selectedSlot}
          settlement={s.settlement}
          zone={zone}
          onPlace={game.actions.place}
          onSelectSlot={game.actions.selectSlot}
        />
        <div className="bx-side">
          <BlockBlastControls
            phase={s.phase}
            betAmount={s.betAmount}
            balance={user?.balance ?? null}
            placements={s.placements}
            cashoutAvailable={s.cashoutAvailable}
            take={s.take}
            multiplier={s.multiplier}
            zone={zone}
            onBet={game.actions.setBetAmount}
            onPlay={game.actions.openModal}
            onCashout={game.actions.cashout}
            onAgain={game.actions.playAgain}
            onRules={() => setRulesOpen(true)}
          />
          <BlockBlastHistory history={s.history} />
        </div>
      </div>

      <BlockBlastModal
        open={s.modalOpen}
        betAmount={s.betAmount}
        onCancel={game.actions.cancelStart}
        onConfirm={() => {
          void game.actions.startGame();
        }}
      />
      <BlockBlastRules open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
