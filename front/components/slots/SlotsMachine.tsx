'use client';

import React from 'react';
import type { SlotMode } from '@/hooks/useSlotsGame';
import type { SlotsWinLineInfo } from '@/lib/api';

interface SlotsMachineProps {
  mode: SlotMode;
  grid: string[][];
  spinning: boolean;
  settledColumns: boolean[];
  winLines: SlotsWinLineInfo[];
  winningCoords: Set<string>;
  outcome: 'win' | 'loss' | 'ldw' | null;
}

const REEL_ANIMATION_STRIP = ['7️⃣', '💎', '💰', '⭐', '🔔', '🍋', '🍒', '🃏'];

export function SlotsMachine({
  mode,
  grid,
  spinning,
  settledColumns,
  winLines,
  winningCoords,
  outcome,
}: SlotsMachineProps) {
  const colsCount = mode === 'mega' ? 5 : 3;
  const isHasWin = winLines.length > 0;

  return (
    <section className="slots_machine__JkaLv" aria-label="Слоты">
      <div
        className="slots_grid__yt7iW"
        data-revealed={!spinning && outcome !== null}
        data-dimfield={!spinning && isHasWin}
        role="img"
        aria-label="Результат барабанов"
      >
        {grid.map((row, rIdx) => {
          const isRowWinning = winLines.some((wl) => wl.coords.some(([r]) => r === rIdx));

          return (
            <div
              key={rIdx}
              className="slots_gridRow__FRkkP"
              data-rowwin={isRowWinning}
              style={{ gridTemplateColumns: `repeat(${colsCount}, 1fr)` }}
            >
              {row.map((symbolEmoji, cIdx) => {
                const isSettled = settledColumns[cIdx] ?? true;
                const coordKey = `${rIdx}-${cIdx}`;
                const isCellWin = !spinning && winningCoords.has(coordKey);
                const isDim = !spinning && isHasWin && !isCellWin;

                return (
                  <span
                    key={cIdx}
                    className={`slots_cell__wvXXQ ${!isSettled ? 'slots_cellSpinning' : ''}`}
                    data-settled={isSettled}
                    data-flash={isCellWin}
                    data-win={isCellWin}
                    data-dim={isDim}
                    aria-hidden="true"
                  >
                    {!isSettled ? (
                      <span className="slots_reelBlurStrip">
                        {REEL_ANIMATION_STRIP.map((sym, sIdx) => (
                          <span key={sIdx} className="slots_symbol__3qy15">
                            {sym}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="slots_symbol__3qy15">{symbolEmoji}</span>
                    )}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
