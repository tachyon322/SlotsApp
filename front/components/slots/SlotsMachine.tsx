'use client';

import React from 'react';
import type { SlotMode } from '@/hooks/useSlotsGame';
import type { SlotsWinLineInfo } from '@/lib/api';
import { SymbolArt, SPIN_STRIP_EMOJIS } from '@/components/slots/symbols';

interface SlotsMachineProps {
  mode: SlotMode;
  grid: string[][];
  spinning: boolean;
  settledColumns: boolean[];
  winLines: SlotsWinLineInfo[];
  winningCoords: Set<string>;
  outcome: 'win' | 'loss' | 'ldw' | null;
}

// Полоса дублируется: анимация прокрутки сдвигает на -50% (бесшовный цикл).
const SPIN_STRIP = [...SPIN_STRIP_EMOJIS, ...SPIN_STRIP_EMOJIS];

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
    <section
      className="sl-machine slv2-machine"
      data-mode={mode}
      aria-label={mode === 'mega' ? 'Слоты Мега' : 'Слоты'}
    >
      <div
        className="sl-grid slv2-reelGrid"
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
              className="sl-gridRow slv2-reelRow"
              data-row={rIdx}
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
                    className="sl-cell slv2-reelCell"
                    data-settled={isSettled}
                    data-flash={isCellWin}
                    data-win={isCellWin}
                    data-dim={isDim}
                    aria-hidden="true"
                  >
                    <span className="sl-symbol slv2-reelSymbol">
                      {isSettled ? (
                        <SymbolArt emoji={symbolEmoji} />
                      ) : (
                        <span className="sl-spinStrip slv2-spinStrip">
                          {SPIN_STRIP.map((stripEmoji, sIdx) => (
                            <span key={sIdx}>
                              <SymbolArt emoji={stripEmoji} spinning />
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
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
