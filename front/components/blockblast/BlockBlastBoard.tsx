'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GRID_SIZE,
  TARGET_PLACEMENTS,
  findBestPlacement,
  formatMultiplier,
  formatRub,
  shapeCells,
  validPositions,
  type Shape,
} from '@/lib/blockblast/engine';
import type { ClearInfo, Phase, TimerLevel } from '@/hooks/useBlockBlastGame';

interface BlockBlastBoardProps {
  phase: Phase;
  board: number[][];
  palette: Shape[];
  placements: number;
  multiplier: number;
  take: number;
  nextMult: number;
  timer: { remaining: number; duration: number } | null;
  timerLevel: TimerLevel;
  clearing: ClearInfo;
  selectedSlot: number | null;
  settlement: { payout: number; total: number; refund: boolean } | null;
  onPlace: (slot: number, row: number, col: number) => void;
  onSelectSlot: (slot: number) => void;
}

const TAP_THRESHOLD = 6;

function ShapeMini({ shape, className }: { shape: Shape; className: string }) {
  return (
    <span
      className={className}
      style={{
        gridTemplateRows: `repeat(${shape.cells.length}, 1fr)`,
        gridTemplateColumns: `repeat(${shape.cells[0].length}, 1fr)`,
      }}
      aria-hidden="true"
    >
      {shape.cells.flatMap((row, r) =>
        row.map((v, c) =>
          v === 1 ? (
            <span key={`${r}-${c}`} className="blockblast_shapeCellOn" />
          ) : (
            <span key={`${r}-${c}`} className="blockblast_shapeCellOff" />
          ),
        ),
      )}
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
  nextMult,
  timer,
  timerLevel,
  clearing,
  selectedSlot,
  settlement,
  onPlace,
  onSelectSlot,
}: BlockBlastBoardProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    slot: number;
    x: number;
    y: number;
    row: number;
    col: number;
    moved: boolean;
  } | null>(null);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);

  const interactive = phase === 'playing';

  const activeShape = drag ? palette[drag.slot] : selectedSlot !== null ? palette[selectedSlot] : null;
  const dragShape = drag ? palette[drag.slot] : null;

  const positions = useMemo(() => {
    if (!activeShape || drag) return null;
    return validPositions(board, activeShape);
  }, [activeShape, board, drag]);

  const anchors = useMemo(() => {
    if (!positions) return new Set<string>();
    return new Set(positions.map(([r, c]) => `${r}:${c}`));
  }, [positions]);

  const previewCells = useMemo(() => {
    if (!activeShape || !drag) return null;
    if (drag.row < 0 || drag.col < 0) return null;
    const best = findBestPlacement(board, activeShape, drag.row, drag.col);
    if (!best) return null;
    return new Set(shapeCells(activeShape).map(([r, c]) => `${best.row + r}:${best.col + c}`));
  }, [activeShape, board, drag]);

  const hoverPreviewCells = useMemo(() => {
    if (!activeShape || drag || selectedSlot === null || !hoverCell) return null;
    const [r, c] = hoverCell;
    const best = findBestPlacement(board, activeShape, r, c);
    if (!best) return null;
    return new Set(shapeCells(activeShape).map(([sr, sc]) => `${best.row + sr}:${best.col + sc}`));
  }, [activeShape, board, drag, selectedSlot, hoverCell]);

  const computeCell = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return [-1, -1];
    const size = rect.width / GRID_SIZE;
    const row = Math.floor((clientY - rect.top) / size);
    const col = Math.floor((clientX - rect.left) / size);
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return [-1, -1];
    return [row, col];
  }, []);

  const handleMove = useCallback(
    (e: PointerEvent) => {
      if (!drag) return;
      const [row, col] = computeCell(e.clientX, e.clientY);
      const moved =
        drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > TAP_THRESHOLD;
      setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY, row, col, moved } : prev));
    },
    [drag, computeCell],
  );

  const handleUp = useCallback(
    () => {
      if (!drag) return;
      if (drag.moved && drag.row >= 0 && drag.col >= 0) {
        onPlace(drag.slot, drag.row, drag.col);
      } else if (!drag.moved) {
        onSelectSlot(drag.slot);
      }
      setDrag(null);
    },
    [drag, onPlace, onSelectSlot],
  );

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

  const startDrag = (slot: number) => (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    setDrag({ slot, x: e.clientX, y: e.clientY, row: -1, col: -1, moved: false });
  };

  const cellPreview = (r: number, c: number): string => {
    if (clearing && (clearing.rows.includes(r) || clearing.cols.includes(c)) && board[r][c] === 1) {
      return 'burning';
    }
    if (board[r][c] === 1) return 'filled';
    const key = `${r}:${c}`;
    if (previewCells?.has(key) || hoverPreviewCells?.has(key)) return 'preview';
    if (anchors?.has(key)) return 'anchor';
    return 'empty';
  };

  const timerWidth = timer && timer.duration > 0 ? (timer.remaining / timer.duration) * 100 : 0;
  const isWon = phase === 'won';
  const isLost = phase === 'lost';

  return (
    <section className="blockblast_stage" data-phase={phase} aria-label="BlockBlast">
      <div className="blockblast_progress">
        <div className="blockblast_progressRow">
          <span>
            Размещено: <strong>{placements} / {TARGET_PLACEMENTS}</strong>
          </span>
          <span className="blockblast_progressMult">{formatMultiplier(multiplier)}</span>
        </div>
        <div className="blockblast_progressRow">
          <span className="blockblast_progressTake">
            Заберёшь: <strong>{formatRub(take)}</strong>
          </span>
          <span className="blockblast_progressNext">Следующий шаг: {formatMultiplier(nextMult)}</span>
        </div>
      </div>

      {interactive && (
        <div className="blockblast_timerWrap" data-level={timerLevel} aria-label={`Время на ход: ${Math.ceil(timer?.remaining ?? 0)} секунд`}>
          <div className="blockblast_timerBar" style={{ width: `${timerWidth}%` }} />
          <span className="blockblast_timerText">{Math.ceil(timer?.remaining ?? 0)}s</span>
        </div>
      )}

      {isWon && settlement && (
        <div className="blockblast_settlement" data-outcome="win">
          <span className="blockblast_settlementLabel">Успешный кассаут</span>
          <span className="blockblast_settlementAmount">+{formatRub(settlement.total)}</span>
        </div>
      )}
      {isLost && settlement && (
        <div className="blockblast_settlement" data-outcome="loss">
          <span className="blockblast_settlementLabel">Раунд завершён · возврат</span>
          <span className="blockblast_settlementAmount">+{formatRub(settlement.payout)}</span>
        </div>
      )}

      <div className="blockblast_boardArea">
        <div className="blockblast_boardWrap">
          <div
            ref={gridRef}
            className="blockblast_grid"
            data-fill="calm"
            role="grid"
            aria-label="Игровое поле 8 на 8"
          >
            {board.map((row, r) => (
              <div className="blockblast_gridRow" role="row" key={r}>
                {row.map((_, c) => {
                  const state = cellPreview(r, c);
                  const burning = state === 'burning';
                  return (
                    <div
                      key={c}
                      role="gridcell"
                      className={`blockblast_cell blockblast_cell${state === 'empty' ? 'Empty' : 'Filled'}`}
                      data-state={state}
                      aria-label={`Ячейка ${r + 1}, ${c + 1}`}
                      onMouseEnter={() => {
                        if (interactive && !drag && selectedSlot !== null) setHoverCell([r, c]);
                      }}
                      onMouseLeave={() => {
                        if (!drag && selectedSlot !== null) setHoverCell(null);
                      }}
                      onClick={() => {
                        if (!interactive) return;
                        if (drag) return;
                        if (selectedSlot !== null) onPlace(selectedSlot, r, c);
                      }}
                    >
                      {burning && <span className="blockblast_cellBurn" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="blockblast_palette" role="group" aria-label="Доступные фигуры">
            {palette.map((shape, i) => (
              <div
                key={i}
                className={`blockblast_paletteSlot ${selectedSlot === i && !drag ? 'blockblast_paletteSlotSelected' : ''}`}
                role="button"
                tabIndex={interactive ? 0 : -1}
                aria-label={`Фигура ${shape.name} — перетащите на поле`}
                style={{ touchAction: 'none' }}
                onPointerDown={startDrag(i)}
                onKeyDown={(e) => {
                  if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelectSlot(i);
                  }
                }}
              >
                <ShapeMini shape={shape} className="blockblast_shapePreview" />
              </div>
            ))}
          </div>
        </div>

        {interactive && placements === 0 && <span className="blockblast_firstMoveHint">Размести первую фигуру</span>}
      </div>

      {drag && dragShape && (
        <div
          className="blockblast_ghost"
          style={{ transform: `translate(${drag.x}px, ${drag.y}px) translate(-50%, -50%)` }}
          aria-hidden="true"
        >
          <span
            className="blockblast_shapePreview"
            style={{
              gridTemplateRows: `repeat(${dragShape.cells.length}, 1fr)`,
              gridTemplateColumns: `repeat(${dragShape.cells[0].length}, 1fr)`,
            }}
          >
            {dragShape.cells.flatMap((row, r) =>
              row.map((v, c) =>
                v === 1 ? (
                  <span key={`${r}-${c}`} className="blockblast_shapeCellOn" />
                ) : (
                  <span key={`${r}-${c}`} className="blockblast_shapeCellOff" />
                ),
              ),
            )}
          </span>
        </div>
      )}
    </section>
  );
}
