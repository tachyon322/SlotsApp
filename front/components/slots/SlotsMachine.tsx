'use client';

import type { SlotMode } from '@/hooks/useSlotsGame';
import type { SlotsWinLineInfo } from '@/lib/api';
import { SLOT_SYMBOLS, type SlotSymbolId } from '@/lib/slots/engine';
import { SymbolArt, SPIN_STRIP_EMOJIS, formatRub } from '@/components/slots/symbols';
import { paylinesFor } from '@/components/slots/paylines';

interface SlotsMachineProps {
  mode: SlotMode;
  grid: string[][];
  spinning: boolean;
  settledColumns: boolean[];
  activeLines: number;
  winLines: SlotsWinLineInfo[];
  winningCoords: Set<string>;
  outcome: 'win' | 'loss' | 'ldw' | null;
  payout: number;
  multiplier: number;
}

// Полоса дублируется: анимация прокрутки сдвигает на -50% (бесшовный цикл).
const SPIN_STRIP = [...SPIN_STRIP_EMOJIS, ...SPIN_STRIP_EMOJIS];

// Маркеры линий слева от барабанов: в каком ряду начинается линия.
const MARKER_ROWS = [0, 1, 2];

function symbolLabel(id: string): string {
  return SLOT_SYMBOLS[id as SlotSymbolId]?.label.toLowerCase() ?? id;
}

function formatMult(m: number): string {
  return `×${m.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SlotsMachine({
  mode,
  grid,
  spinning,
  settledColumns,
  activeLines,
  winLines,
  winningCoords,
  outcome,
  payout,
  multiplier,
}: SlotsMachineProps) {
  const cols = mode === 'mega' ? 5 : 3;
  const lines = paylinesFor(mode);
  const hasWin = !spinning && winLines.length > 0;
  const hitIds = new Set(hasWin ? winLines.map((w) => w.lineId) : []);

  let result: React.ReactNode;
  if (spinning) {
    result = (
      <>
        <span className="pg-spin" aria-hidden="true" />
        Барабаны крутятся…
      </>
    );
  } else if (outcome === null) {
    result = mode === 'mega' ? 'От 3 одинаковых слева направо' : 'Соберите 3 одинаковых на активной линии';
  } else if (payout <= 0) {
    result = 'Без выигрыша — попробуйте ещё';
  } else {
    const best = [...winLines].sort((a, b) => b.payout - a.payout)[0];
    result = (
      <>
        <b data-tone={outcome === 'win' ? 'pos' : 'mute'}>
          {outcome === 'win' ? `+${formatRub(payout)}` : `Возврат ${formatRub(payout)}`}
        </b>
        {outcome === 'win' && <em>{formatMult(multiplier)}</em>}
        {best && (
          <span>
            {winLines.length > 1
              ? `линий: ${winLines.length}`
              : `линия ${best.lineId} · ${symbolLabel(best.symbol)} ×${best.count}`}
          </span>
        )}
      </>
    );
  }

  return (
    <section className="sg-mach" data-mode={mode} aria-label={mode === 'mega' ? 'Мега-слоты 5×3' : 'Слоты 3×3'}>
      <div className="sg-marks" aria-hidden="true">
        {MARKER_ROWS.map((row) => (
          <p key={row}>
            {lines
              .filter((l) => l.coords[0][0] === row)
              .map((l) => (
                <i key={l.id} data-on={l.id <= activeLines} data-hit={hitIds.has(l.id)}>
                  {l.id}
                </i>
              ))}
          </p>
        ))}
      </div>

      <div className="sg-reels" role="img" aria-label="Результат барабанов" style={{ '--cols': cols } as React.CSSProperties}>
        {grid.map((row, r) =>
          row.map((emoji, c) => {
            const settled = settledColumns[c] ?? true;
            const win = !spinning && winningCoords.has(`${r}-${c}`);
            return (
              <span
                key={`${r}-${c}`}
                className="sg-cell"
                data-settled={settled}
                data-win={win}
                data-dim={hasWin && !win}
              >
                {settled ? (
                  <SymbolArt emoji={emoji} />
                ) : (
                  <span className="sg-strip" style={{ animationDelay: `-${((r * 5 + c * 3) % 16) * 0.02}s` }}>
                    {SPIN_STRIP.map((stripEmoji, i) => (
                      <span key={i}>
                        <SymbolArt emoji={stripEmoji} spinning />
                      </span>
                    ))}
                  </span>
                )}
              </span>
            );
          }),
        )}
      </div>

      <div className="sg-result" aria-live="polite">
        {result}
      </div>
    </section>
  );
}
