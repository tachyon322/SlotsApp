'use client';

import { useEffect, useState } from 'react';
import { useBlockBlastGame } from '@/hooks/useBlockBlastGame';
import { BlockBlastIntro } from '@/components/blockblast/BlockBlastIntro';
import { BlockBlastBoard } from '@/components/blockblast/BlockBlastBoard';
import { BlockBlastControls } from '@/components/blockblast/BlockBlastControls';
import { BlockBlastHistory } from '@/components/blockblast/BlockBlastHistory';
import { BlockBlastModal } from '@/components/blockblast/BlockBlastModal';
import { useUser } from '@/components/UserProvider';
import { boardFilledCount, GRID_SIZE } from '@/lib/blockblast/engine';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

// Зона риска по заполнению поля: rising/danger/critical (подсветка рамки поля
// и кнопки кэшаута). Пороги: ~1/3, ~1/2 и ~2/3 клеток из 64.
function fillZone(filled: number): 'rising' | 'danger' | 'critical' | null {
  if (filled >= (GRID_SIZE * GRID_SIZE * 2) / 3) return 'critical';
  if (filled >= (GRID_SIZE * GRID_SIZE) / 2) return 'danger';
  if (filled >= (GRID_SIZE * GRID_SIZE) / 3) return 'rising';
  return null;
}

export default function BlockBlastPage() {
  const game = useBlockBlastGame();
  const { user } = useUser();
  const s = game.state;
  const reducedMotion = usePrefersReducedMotion();

  const filled = s.board ? boardFilledCount(s.board) : 0;
  const zone = s.phase === 'playing' ? fillZone(filled) : null;

  return (
    <div
      className="bb-shell"
      data-variant="blockblast"
      data-zone={zone ?? undefined}
      data-low-time={s.phase === 'playing' && s.timerLevel === 'danger' ? 'true' : undefined}
      data-reduced-motion={reducedMotion || undefined}
    >
      <div className="bu-gameSurface">
        <header className="bu-gameHeader">
          <div>
            <span className="bu-eyebrow">LITGAME ORIGINAL</span>
            <h1 className="bu-title">BlockBlast</h1>
            <p className="bu-subtitle">
              Собирайте линии, размещая реальные фигуры на поле 8 × 8
            </p>
          </div>
          <span className="bu-heroArt" aria-hidden="true" />
        </header>

        <div className="bu-gameLayout">
          <div className="bu-mainColumn">
            {s.phase === 'idle' ? (
              <BlockBlastIntro />
            ) : (
              <BlockBlastBoard
                phase={s.phase}
                board={s.board}
                palette={s.palette}
                placements={s.placements}
                multiplier={s.multiplier}
                take={s.take}
                nextMult={s.nextMult}
                timer={s.timer}
                timerLevel={s.timerLevel}
                clearing={s.clearing}
                selectedSlot={s.selectedSlot}
                settlement={s.settlement}
                reducedMotion={reducedMotion}
                onPlace={game.actions.place}
                onSelectSlot={game.actions.selectSlot}
              />
            )}
            <BlockBlastControls
              phase={s.phase}
              betAmount={s.betAmount}
              balance={user?.balance ?? null}
              cashoutAvailable={s.cashoutAvailable}
              take={s.take}
              multiplier={s.multiplier}
              zone={zone}
              onBet={game.actions.setBetAmount}
              onPlay={game.actions.openModal}
              onCashout={game.actions.cashout}
              onAgain={game.actions.playAgain}
            />
          </div>
          <aside className="bu-sideColumn" aria-label="История BlockBlast">
            <BlockBlastHistory history={s.history} />
          </aside>
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
    </div>
  );
}
