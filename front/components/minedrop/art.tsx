import { BLOCK_COLOR, BLOCK_IMAGE } from '@/lib/minedrop/engine';
import {
  BLOCKS,
  ENGINE_VERSION,
  TOOL_BY_ID,
  simulateRound,
  type BlockId,
  type PickaxeRound,
  type ToolDef,
} from '@/lib/minedrop/pickaxeEngine';

export { BLOCK_COLOR, BLOCK_IMAGE };

/** Раунд для шторки «Чек»: текущий (из хука) или из истории. */
export interface RoundView {
  id?: string;
  bet: number;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss';
  createdAt?: string;
  /** Инструмент раунда (null — раунд старой версии игры). */
  tool: ToolDef | null;
  /** Полный раунд движка — если его можно восстановить по seed. */
  round: PickaxeRound | null;
}

/** Поле details истории для текущего движка: {v, seed, tool, blocks, depth}. */
export interface RoundDetails {
  version: number;
  seed: number;
  tool: ToolDef | null;
  blocks: number;
  depth: number;
}

/** Разбор details из истории. Раунды старой версии (массив колонн) и битые данные → null. */
export function parseDetails(details: string): RoundDetails | null {
  try {
    const raw = JSON.parse(details) as unknown;
    if (!raw || Array.isArray(raw) || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const seed = Number(obj.seed);
    if (!Number.isInteger(seed) || seed < 0) return null;
    return {
      version: Number(obj.v) || 0,
      seed,
      tool: TOOL_BY_ID[String(obj.tool)] ?? null,
      blocks: Number(obj.blocks) || 0,
      depth: Number(obj.depth) || 0,
    };
  } catch {
    return null;
  }
}

/** Восстанавливает раунд по seed, если он сыгран текущей версией движка. */
export function replayRound(d: RoundDetails | null): PickaxeRound | null {
  if (!d || d.version !== ENGINE_VERSION) return null;
  return simulateRound(d.seed);
}

/** Сколько блоков каждого типа разбито — от самых ценных к пустым. */
export function brokenBlocks(round: PickaxeRound): Array<[BlockId, number]> {
  const counts = new Map<BlockId, number>();
  for (const ev of round.events) {
    if (ev.k === 'break') counts.set(ev.b, (counts.get(ev.b) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => BLOCKS[b[0]].value - BLOCKS[a[0]].value);
}

/** Иконка блока для шторок: текстура или цветная плашка (TNT, починка). */
export function BlockIcon({ id }: { id: BlockId }) {
  const src = BLOCK_IMAGE[id];
  if (src) return <i className="md2-tool" style={{ backgroundImage: `url(${src})` }} aria-hidden="true" />;
  return (
    <i className="md2-tool" data-flat={id} style={{ background: BLOCK_COLOR[id] }} aria-hidden="true">
      {id === 'tnt' ? 'TNT' : '↑'}
    </i>
  );
}

/** Иконка инструмента. */
export function ToolIcon({ tool }: { tool: ToolDef }) {
  return <i className="md2-tool" style={{ backgroundImage: `url(${tool.image})` }} aria-hidden="true" />;
}
