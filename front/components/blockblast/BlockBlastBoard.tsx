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
  reducedMotion: boolean;
  onPlace: (slot: number, row: number, col: number) => void;
  onSelectSlot: (slot: number) => void;
}

const TAP_THRESHOLD = 6;

function ShapeMini({ shape, dim }: { shape: Shape; dim?: boolean }) {
  return (
    <span
      className="bb-shapePreview"
      data-columns={shape.cells[0].length}
      data-rows={shape.cells.length}
      data-dim={dim || undefined}
      style={{
        gridTemplateRows: `repeat(${shape.cells.length}, 1fr)`,
        gridTemplateColumns: `repeat(${shape.cells[0].length}, 1fr)`,
      }}
      aria-hidden="true"
    >
      {shape.cells.flatMap((row, r) =>
        row.map((v, c) =>
          v === 1 ? (
            <span key={`${r}-${c}`} className="bb-shapeCellOn" />
          ) : (
            <span key={`${r}-${c}`} className="bb-shapeCellOff" />
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
  reducedMotion,
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
  const clearSeq = useRef(0);

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

  // Красный призрак: курсор над полем, но фигуру поставить нельзя —
  // подсвечиваем клетки под курсором (с‑у). Только вью, логика не тронута.
  const dragInvalidCells = useMemo(() => {
    if (!drag || !dragShape || previewCells) return null;
    if (drag.row < 0 || drag.col < 0) return null;
    const rows = dragShape.cells.length;
    const cols = dragShape.cells[0].length;
    const cells = shapeCells(dragShape);
    let sumR = 0;
    let sumC = 0;
    cells.forEach(([r, c]) => {
      sumR += r;
      sumC += c;
    });
    const r0 = Math.min(
      Math.max(drag.row - Math.round(sumR / cells.length), 0),
      GRID_SIZE - rows,
    );
    const c0 = Math.min(
      Math.max(drag.col - Math.round(sumC / cells.length), 0),
      GRID_SIZE - cols,
    );
    return new Set(cells.map(([r, c]) => `${r0 + r}:${c0 + c}`));
  }, [drag, dragShape, previewCells]);

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

  // Перезапуск анимации баннера сгоревших линий при каждом клире.
  useEffect(() => {
    if (clearing) clearSeq.current += 1;
  }, [clearing]);

  const startDrag = (slot: number) => (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    setDrag({ slot, x: e.clientX, y: e.clientY, row: -1, col: -1, moved: false });
  };

  const filled = useMemo(() => board.flat().reduce((acc, v) => acc + v, 0), [board]);
  // Зона заполнения поля (рамка): low/mid/high — ~1/3 и ~2/3 клеток из 64.
  const fillZone = filled >= (GRID_SIZE * GRID_SIZE * 2) / 3 ? 'high' : filled >= (GRID_SIZE * GRID_SIZE) / 3 ? 'mid' : 'low';

  const armed = interactive && (drag !== null || selectedSlot !== null);
  const ghostCells = drag ? (previewCells ?? dragInvalidCells) : hoverPreviewCells;
  const ghostKind: 'valid' | 'invalid' | null = ghostCells
    ? drag && !previewCells
      ? 'invalid'
      : 'valid'
    : null;

  const cellClass = (r: number, c: number): string => {
    const key = `${r}:${c}`;
    const burning = Boolean(
      clearing && (clearing.rows.includes(r) || clearing.cols.includes(c)),
    );
    let cls = 'bb-cell';
    if (board[r][c] === 1) {
      cls += ' bb-cellFilled';
      if (burning) cls += ' bb-cellClearing';
      if (ghostKind === 'invalid' && ghostCells?.has(key)) cls += ' bb-cellGhostInvalid';
    } else {
      cls += ' bb-cellEmpty';
      if (ghostCells?.has(key)) {
        cls += ghostKind === 'invalid' ? ' bb-cellGhostInvalid' : ' bb-cellGhostValid';
      } else if (armed) {
        cls += anchors.has(key) ? ' bb-cellValidHint' : ' bb-cellInvalidHint';
      }
    }
    return cls;
  };

  const timerWidth = timer && timer.duration > 0 ? (timer.remaining / timer.duration) * 100 : 0;
  const isWon = phase === 'won';

  const linesCleared = clearing ? clearing.rows.length + clearing.cols.length : 0;
  const clearTone =
    linesCleared >= 4 ? 'mega' : linesCleared === 3 ? 'big' : linesCleared === 2 ? 'double' : 'single';
  const clearText =
    linesCleared >= 4
      ? 'МЕГА!'
      : linesCleared === 3
        ? 'ТРОЙНАЯ!'
        : linesCleared === 2
          ? 'ДВОЙНАЯ!'
          : 'ЛИНИЯ!';
  const dragValidHint =
    drag && drag.moved && drag.row >= 0 ? previewCells !== null : null;

  return (
    <section className="bb-stage bu-stage" aria-label="BlockBlast">
      <div
        className="bh-progress"
        data-ready={placements >= TARGET_PLACEMENTS || undefined}
      >
        <div className="bh-progressRow">
          <span className="bh-progressLabel">Размещено</span>
          <span className="bh-progressPlacements">
            {placements} / {TARGET_PLACEMENTS}
          </span>
        </div>
        <div className="bh-progressRow">
          <span className="bh-progressLabel">Множитель</span>
          <span className="bh-progressMult">{formatMultiplier(multiplier)}</span>
        </div>
        <div className="bh-progressRow bh-progressDetailRow">
          <span className="bh-progressLabel">Заберёшь</span>
          <span className="bh-progressValue">{formatRub(take)}</span>
        </div>
        <div className="bh-progressRow bh-progressDetailRow">
          <span className="bh-progressLabel">Следующий шаг</span>
          <span className="bh-progressNextValue">{formatMultiplier(nextMult)}</span>
        </div>
      </div>

      {interactive && (
        <div
          className="bb-timerWrap"
          data-level={timerLevel === 'danger' ? 'crit' : timerLevel}
          aria-label={`Время на ход: ${Math.ceil(timer?.remaining ?? 0)} секунд`}
        >
          <div className="bb-timerBar" style={{ width: `${timerWidth}%` }} />
          <span className="bb-timerText">{Math.ceil(timer?.remaining ?? 0)}s</span>
        </div>
      )}

      {settlement && (
        <div className="bb-bannerWrap" data-outcome={isWon ? 'win' : undefined}>
          <p className={isWon ? 'bb-bannerWin' : 'bb-bannerNeutral'}>
            +{formatRub(isWon ? settlement.total : settlement.payout)}
          </p>
          <p className="bb-bannerReason">
            {isWon ? 'успешный кассаут' : 'раунд завершён · возврат'}
          </p>
        </div>
      )}

      <div className="bb-boardArea">
        <div className="bb-boardWrap" data-dragging={drag ? 'true' : undefined}>
          <div
            ref={gridRef}
            className="bb-grid"
            data-fill={fillZone}
            role="grid"
            aria-label="Игровое поле 8 на 8"
          >
            {board.map((row, r) => (
              <div className="bb-gridRow" role="row" key={r}>
                {row.map((_, c) => (
                  <div
                    key={c}
                    role="gridcell"
                    className={cellClass(r, c)}
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
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="bb-palette" role="group" aria-label="Доступные фигуры">
            {palette.map((shape, i) => {
              const slotClass = [
                'bb-paletteSlot',
                selectedSlot === i && !drag ? 'bb-paletteSlotSelected' : '',
                drag?.slot === i ? 'bb-paletteSlotDragging' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={i}
                  className={slotClass}
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
                  <ShapeMini
                    shape={shape}
                    dim={selectedSlot !== null && selectedSlot !== i && !drag}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {clearing && linesCleared > 0 && (
          <span key={clearSeq.current} className="bb-clearBanner" data-tone={clearTone}>
            {clearText}
          </span>
        )}
        {interactive && placements === 0 && (
          <span className="bb-firstMoveHint">Размести первую фигуру</span>
        )}
      </div>

      {drag && dragShape && (
        <div
          className="bb-floatingPiece"
          data-valid={dragValidHint === false ? 'false' : undefined}
          data-reduced-motion={reducedMotion || undefined}
          style={{
            left: drag.x,
            top: drag.y,
            gridTemplateRows: `repeat(${dragShape.cells.length}, 1fr)`,
            gridTemplateColumns: `repeat(${dragShape.cells[0].length}, 1fr)`,
          }}
          aria-hidden="true"
        >
          {dragShape.cells.flatMap((row, r) =>
            row.map((v, c) =>
              v === 1 ? (
                <span key={`${r}-${c}`} className="bb-floatCellOn" />
              ) : (
                <span key={`${r}-${c}`} className="bb-floatCellOff" />
              ),
            ),
          )}
        </div>
      )}
    </section>
  );
}
