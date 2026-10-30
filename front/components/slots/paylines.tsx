import type { SlotMode } from '@/hooks/useSlotsGame';

/**
 * Линии выплат — зеркало CLASSIC_PAYLINES / MEGA_PAYLINES в back/src/routes/slots.ts.
 * Активны первые N линий (N = выбранное число линий). Координаты — [ряд, барабан].
 */
export interface Payline {
  id: number;
  name: string;
  coords: Array<[number, number]>;
}

const CLASSIC: Payline[] = [
  { id: 1, name: 'центр', coords: [[1, 0], [1, 1], [1, 2]] },
  { id: 2, name: 'верх', coords: [[0, 0], [0, 1], [0, 2]] },
  { id: 3, name: 'низ', coords: [[2, 0], [2, 1], [2, 2]] },
];

const MEGA: Payline[] = [
  { id: 1, name: 'центр', coords: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] },
  { id: 2, name: 'верх', coords: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: 3, name: 'низ', coords: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]] },
  { id: 4, name: 'V', coords: [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]] },
  { id: 5, name: 'Λ', coords: [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4]] },
];

export function paylinesFor(mode: SlotMode): Payline[] {
  return mode === 'mega' ? MEGA : CLASSIC;
}

/** Мини-схема линии: точки 3×N и ломаная по ячейкам линии. */
export function PaylineGlyph({ line, className }: { line: Payline; className?: string }) {
  const cols = line.coords.length;
  const w = cols === 5 ? 46 : 30;
  const x = (c: number) => 4 + (c * (w - 8)) / (cols - 1);
  const y = (r: number) => 4 + r * 10;
  const dots = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < cols; c++) dots.push(<circle key={`${r}-${c}`} cx={x(c)} cy={y(r)} r={1.6} />);
  }
  return (
    <svg className={className} viewBox={`0 0 ${w} 28`} aria-hidden="true">
      <g className="sg-glyph-dots">{dots}</g>
      <polyline points={line.coords.map(([r, c]) => `${x(c)},${y(r)}`).join(' ')} />
    </svg>
  );
}
