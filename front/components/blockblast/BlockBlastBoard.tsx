'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  GRID_SIZE,
  SHAPES,
  TARGET_PLACEMENTS,
  canPlaceSomewhere,
  findBestPlacement,
  formatMultiplier,
  formatRub,
  lineBonus,
  shapeCells,
  validPositions,
  type Shape,
} from '@/lib/blockblast/engine';
import type { ClearInfo, Phase, TimerLevel } from '@/hooks/useBlockBlastGame';
import { percent, refundRatio } from '@/components/blockblast/rules';
import { pluralRu } from '@/lib/format';

export type FillZone = 'rising' | 'danger' | 'critical' | null;

interface BlockBlastBoardProps {
  phase: Phase;
  board: number[][];
  palette: Shape[];
  placements: number;
  multiplier: number;
  take: number;
  betAmount: number;
  lineBonusTotal: number;
  timer: { remaining: number; duration: number } | null;
  timerLevel: TimerLevel;
  clearing: ClearInfo;
  selectedSlot: number | null;
  settlement: { payout: number; total: number; refund: boolean } | null;
  zone: FillZone;
  onPlace: (slot: number, row: number, col: number) => void;
  onSelectSlot: (slot: number) => void;
}

const TAP_THRESHOLD = 6;
// На тач-экране фигура висит над пальцем на этом расстоянии (палец не закрывает её),
// а клетка-цель берётся под самой фигурой — куда нарисована, туда и встанет.
const TOUCH_LIFT = 30;

// Узор поля до старта — только картинка.
const DEMO: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0],
  [0, 0, 1, 1, 0, 0, 1, 0],
  [0, 0, 1, 1, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 0, 0, 1, 1, 0],
  [0, 1, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

// Лоток до старта — постоянные фигуры: палитра хука случайна, и SSR разошёлся бы с клиентом.
const DEMO_PIECES: Shape[] = ['square_2x2', 'line_3', 't'].map((id) => SHAPES.find((sh) => sh.id === id) ?? SHAPES[0]);

/**
 * Опорная клетка фигуры для прицеливания: самая близкая к углу (при равенстве — нижняя/правая).
 * findBestPlacement из всех позиций, накрывающих цель, берёт позицию с ближайшим к цели углом,
 * а при равных расстояниях — первую по строкам; с такой опорой выигрывает ровно та позиция,
 * где фигура нарисована (иначе S съезжала на клетку вверх-вправо).
 */
function keyCell(shape: Shape): [number, number] {
  return shapeCells(shape).reduce((best, cur) => {
    const d = Math.hypot(cur[0], cur[1]) - Math.hypot(best[0], best[1]);
    if (d < -1e-9) return cur;
    if (Math.abs(d) <= 1e-9 && (cur[0] > best[0] || (cur[0] === best[0] && cur[1] > best[1]))) return cur;
    return best;
  });
}

interface Drag {
  slot: number;
  x: number;
  y: number;
  row: number;
  col: number;
  moved: boolean;
  /** Сдвиг центра фигуры вверх от указателя, px. */
  lift: number;
  /** Шаг клетки поля (клетка + зазор) и зазор, px — фигура в руке того же размера. */
  step: number;
  gap: number;
}

function pieceSize(shape: Shape, step: number, gap: number) {
  return { w: shape.cells[0].length * step - gap, h: shape.cells.length * step - gap };
}

function Piece({ shape, className, style, bad }: { shape: Shape; className: string; style?: CSSProperties; bad?: boolean }) {
  return (
    <span
      className={className}
      data-bad={bad || undefined}
      style={{
        ...style,
        gridTemplateRows: `repeat(${shape.cells.length}, var(--bx-pc))`,
        gridTemplateColumns: `repeat(${shape.cells[0].length}, var(--bx-pc))`,
      }}
      aria-hidden="true"
    >
      {shape.cells.flatMap((row, r) => row.map((v, c) => <i key={`${r}-${c}`} data-on={v === 1 || undefined} />))}
    </span>
  );
}

export function BlockBlastBoard({
  phase,
  board,
  palette,
  placements,
  multiplier,
  take,
  betAmount,
  lineBonusTotal,
  timer,
  timerLevel,
  clearing,
  selectedSlot,
  settlement,
  zone,
  onPlace,
  onSelectSlot,
}: BlockBlastBoardProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const clearSeq = useRef(0);

  const idle = phase === 'idle';
  const interactive = phase === 'playing';
  const ended = phase === 'won' || phase === 'lost';
  const cells = idle ? DEMO : board;
  const pieces = idle ? DEMO_PIECES : palette;

  const activeShape = drag ? palette[drag.slot] : selectedSlot !== null ? palette[selectedSlot] : null;
  const dragShape = drag ? palette[drag.slot] : null;

  const anchors = useMemo(() => {
    if (!activeShape || drag) return new Set<string>();
    return new Set(validPositions(board, activeShape).map(([r, c]) => `${r}:${c}`));
  }, [activeShape, board, drag]);

  const previewCells = useMemo(() => {
    if (!activeShape || !drag || drag.row < 0 || drag.col < 0) return null;
    const best = findBestPlacement(board, activeShape, drag.row, drag.col);
    if (!best) return null;
    return new Set(shapeCells(activeShape).map(([r, c]) => `${best.row + r}:${best.col + c}`));
  }, [activeShape, board, drag]);

  const hoverPreviewCells = useMemo(() => {
    if (!activeShape || drag || selectedSlot === null || !hoverCell) return null;
    const best = findBestPlacement(board, activeShape, hoverCell[0], hoverCell[1]);
    if (!best) return null;
    return new Set(shapeCells(activeShape).map(([r, c]) => `${best.row + r}:${best.col + c}`));
  }, [activeShape, board, drag, selectedSlot, hoverCell]);

  // Фигуру поставить нельзя: красим клетки там, где она нарисована (с прижатием к краям поля).
  const dragInvalidCells = useMemo(() => {
    if (!drag || !dragShape || previewCells || drag.row < 0 || drag.col < 0) return null;
    const [r0, c0] = keyCell(dragShape);
    const top = Math.min(Math.max(drag.row - r0, 0), GRID_SIZE - dragShape.cells.length);
    const left = Math.min(Math.max(drag.col - c0, 0), GRID_SIZE - dragShape.cells[0].length);
    return new Set(shapeCells(dragShape).map(([r, c]) => `${top + r}:${left + c}`));
  }, [drag, dragShape, previewCells]);

  // Клетка-цель = клетка под опорной клеткой фигуры в руке.
  const targetCell = useCallback(
    (d: Drag, x: number, y: number): [number, number] => {
      const rect = gridRef.current?.getBoundingClientRect();
      const shape = palette[d.slot];
      if (!rect || !shape) return [-1, -1];
      const { w, h } = pieceSize(shape, d.step, d.gap);
      const [r0, c0] = keyCell(shape);
      const px = x - w / 2 + c0 * d.step + (d.step - d.gap) / 2;
      const py = y - d.lift - h / 2 + r0 * d.step + (d.step - d.gap) / 2;
      const row = Math.floor((py - rect.top) / d.step);
      const col = Math.floor((px - rect.left) / d.step);
      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return [-1, -1];
      return [row, col];
    },
    [palette],
  );

  const handleMove = useCallback(
    (e: PointerEvent) => {
      if (!drag) return;
      const [row, col] = targetCell(drag, e.clientX, e.clientY);
      const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > TAP_THRESHOLD;
      setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY, row, col, moved } : prev));
    },
    [drag, targetCell],
  );

  const handleUp = useCallback(() => {
    if (!drag) return;
    if (drag.moved && drag.row >= 0 && drag.col >= 0) {
      onPlace(drag.slot, drag.row, drag.col);
    } else if (!drag.moved) {
      onSelectSlot(drag.slot);
    }
    setDrag(null);
  }, [drag, onPlace, onSelectSlot]);

  useEffect(() => {
    if (!drag) return;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [drag, handleMove, handleUp]);

  // Перезапуск анимации надписи о сгоревших линиях при каждом клире.
  useEffect(() => {
    if (clearing) clearSeq.current += 1;
  }, [clearing]);

  const startDrag = (slot: number) => (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    const grid = gridRef.current;
    const shape = palette[slot];
    if (!grid || !shape) return;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const step = (grid.getBoundingClientRect().width + gap) / GRID_SIZE;
    const lift = e.pointerType === 'mouse' ? 0 : pieceSize(shape, step, gap).h / 2 + TOUCH_LIFT;
    setDrag({ slot, x: e.clientX, y: e.clientY, row: -1, col: -1, moved: false, lift, step, gap });
  };

  const armed = interactive && (drag !== null || selectedSlot !== null);
  const ghostCells = drag ? (previewCells ?? dragInvalidCells) : hoverPreviewCells;
  const ghostKind: 'ok' | 'bad' | null = ghostCells ? (drag && !previewCells ? 'bad' : 'ok') : null;

  const cellState = (r: number, c: number) => {
    const key = `${r}:${c}`;
    const on = cells[r][c] === 1;
    const burning = Boolean(on && clearing && (clearing.rows.includes(r) || clearing.cols.includes(c)));
    let ghost: string | undefined;
    if (ghostCells?.has(key) && (!on || ghostKind === 'bad')) ghost = ghostKind ?? undefined;
    const hint = !on && !ghost && armed && !drag ? (anchors.has(key) ? undefined : 'off') : undefined;
    return { on, burning, ghost, hint };
  };

  const linesCleared = clearing ? clearing.rows.length + clearing.cols.length : 0;
  const clearText =
    linesCleared >= 4 ? 'МЕГА!' : linesCleared === 3 ? 'ТРОЙНАЯ!' : linesCleared === 2 ? 'ДВОЙНАЯ!' : 'ЛИНИЯ!';

  const ready = placements >= TARGET_PLACEMENTS;
  const left = Math.max(0, TARGET_PLACEMENTS - placements);
  const timerFrac = timer && timer.duration > 0 ? timer.remaining / timer.duration : 0;
  const seconds = Math.ceil(timer?.remaining ?? 0);
  const net = settlement ? settlement.total - betAmount : 0;

  return (
    <section className="bx-board" data-phase={phase} aria-label="Поле BlockBlast">
      <div className="bx-stats">
        {idle ? (
          <>
            <div>
              <small>Забрать с</small>
              <b>{TARGET_PLACEMENTS}-й</b>
            </div>
            <div>
              <small>Множитель</small>
              <b>×1.5 – ×2</b>
            </div>
            <div>
              <small>За линию</small>
              <b data-tone="pos">+{formatRub(lineBonus(betAmount))}</b>
            </div>
          </>
        ) : (
          <>
            <div className="bx-prog" style={{ '--p': Math.min(1, placements / TARGET_PLACEMENTS) } as CSSProperties}>
              <small>Фигур</small>
              <b data-tone={ready ? 'gold' : undefined}>
                {placements}
                {!ready && <em>/{TARGET_PLACEMENTS}</em>}
              </b>
              <i aria-hidden="true" />
            </div>
            <div>
              <small>{ready ? 'Множитель' : ended ? 'Кэшаут' : `Кэшаут через ${left}`}</small>
              <b data-tone={ready ? 'on' : 'dim'}>{ready ? formatMultiplier(multiplier) : '×1.5'}</b>
            </div>
            {ended && settlement ? (
              <div>
                <small>{phase === 'won' ? 'Получено' : 'Вернулось'}</small>
                <b data-tone={phase === 'won' ? 'pos' : undefined}>{formatRub(settlement.total)}</b>
              </div>
            ) : (
              <div>
                <small>{ready ? 'Заберёшь' : 'Если тупик'}</small>
                <b data-tone={ready ? 'pos' : undefined}>
                  {ready ? formatRub(take) : formatRub(betAmount * refundRatio(placements))}
                </b>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bx-card" data-zone={zone ?? undefined} data-low={(interactive && timerLevel === 'danger') || undefined}>
        <div className="bx-status">
          {interactive ? (
            <div
              className="bx-timer"
              data-level={timerLevel}
              role="timer"
              aria-label={`Время на ход: ${seconds} ${pluralRu(seconds, ['секунда', 'секунды', 'секунд'])}`}
            >
              <span className="bx-timerTrack">
                <span className="bx-timerFill" style={{ transform: `scaleX(${timerFrac})` }} />
                {placements === 0 && <em>Перетащи фигуру на поле</em>}
              </span>
              <b>{seconds} с</b>
            </div>
          ) : (
            <p>{idle ? 'На каждый ход — таймер: 10 с, дальше меньше' : 'Раунд окончен'}</p>
          )}
        </div>

        <div className="bx-gridWrap" data-dragging={drag ? 'true' : undefined}>
          <div ref={gridRef} className="bx-grid" role="grid" aria-label="Игровое поле 8 на 8">
            {cells.map((row, r) => (
              <div className="bx-row" role="row" key={r}>
                {row.map((_, c) => {
                  const st = cellState(r, c);
                  return (
                    <div
                      key={c}
                      role="gridcell"
                      className="bx-cell"
                      data-on={st.on || undefined}
                      data-burn={st.burning || undefined}
                      data-ghost={st.ghost}
                      data-hint={st.hint}
                      aria-label={`Ячейка ${r + 1}, ${c + 1}${st.on ? ', занята' : ''}`}
                      onMouseEnter={() => {
                        if (interactive && !drag && selectedSlot !== null) setHoverCell([r, c]);
                      }}
                      onMouseLeave={() => {
                        if (!drag && selectedSlot !== null) setHoverCell(null);
                      }}
                      onClick={() => {
                        if (!interactive || drag) return;
                        if (selectedSlot !== null) onPlace(selectedSlot, r, c);
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {clearing && linesCleared > 0 && (
            <span key={clearSeq.current} className="bx-clear" data-lines={Math.min(linesCleared, 4)}>
              {clearText}
            </span>
          )}
        </div>

        {ended ? (
          <div className="bx-result" data-tone={phase === 'won' ? 'win' : 'loss'} aria-live="polite">
            {settlement ? (
              <>
                <div className="bx-resMain">
                  <small>{phase === 'won' ? 'Выигрыш' : 'Вернулось'}</small>
                  <b>{formatRub(settlement.total)}</b>
                </div>
                <ul className="bx-resSide">
                  <li>
                    {placements} {pluralRu(placements, ['фигура', 'фигуры', 'фигур'])} ·{' '}
                    {phase === 'won' ? formatMultiplier(multiplier) : `${percent(refundRatio(placements))} ставки`}
                  </li>
                  {lineBonusTotal > 0 && <li>линии +{formatRub(lineBonusTotal)}</li>}
                  <li data-tone={net > 0 ? 'pos' : 'neg'}>
                    {net > 0 ? `+${formatRub(net)}` : net < 0 ? `−${formatRub(-net)}` : '±0 ₽'}
                  </li>
                </ul>
              </>
            ) : (
              <div className="bx-resMain">
                <small>Раунд закрыт</small>
                <b>—</b>
              </div>
            )}
          </div>
        ) : (
          <div className="bx-tray" role="group" aria-label="Фигуры">
            {pieces.map((shape, i) => {
              const fits = !interactive || canPlaceSomewhere(board, shape);
              return (
                <div
                  key={i}
                  className="bx-slot"
                  role="button"
                  tabIndex={interactive ? 0 : -1}
                  aria-label={`Фигура ${shape.name}${fits ? '' : ', некуда поставить'}`}
                  aria-pressed={interactive ? selectedSlot === i && !drag : undefined}
                  aria-disabled={!interactive || undefined}
                  data-fit={fits ? undefined : 'false'}
                  data-dragging={drag?.slot === i || undefined}
                  data-dim={(selectedSlot !== null && selectedSlot !== i && !drag) || undefined}
                  onPointerDown={startDrag(i)}
                  onKeyDown={(e) => {
                    if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelectSlot(i);
                    }
                  }}
                >
                  <Piece shape={shape} className="bx-piece" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {drag && dragShape && (
        <Piece
          shape={dragShape}
          className="bx-float"
          bad={drag.moved && !previewCells}
          style={
            {
              left: drag.x,
              top: drag.y - drag.lift,
              '--bx-pc': `${drag.step - drag.gap}px`,
              gap: `${drag.gap}px`,
            } as CSSProperties
          }
        />
      )}
    </section>
  );
}
