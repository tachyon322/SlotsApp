'use client';

import { ModalShell } from '@/components/ModalShell';
import { BLOCK_COLOR, BLOCK_IMAGE } from '@/lib/minedrop/engine';
import {
  BLOCKS,
  CHEST_TABLE,
  HIT_COST,
  PAYOUT_DEN,
  PAYOUT_NUM,
  REPAIR_AMOUNT,
  TOOLS,
  type BlockId,
} from '@/lib/minedrop/pickaxeEngine';

interface MineDropRulesSheetProps {
  open: boolean;
  onClose: () => void;
}

const ORE_ORDER: BlockId[] = ['coal', 'iron', 'redstone', 'gold', 'diamond'];
const PLAIN_ORDER: BlockId[] = ['grass', 'dirt', 'stone'];
const TOOL_WEIGHT_TOTAL = TOOLS.reduce((s, t) => s + t.weight, 0);
/** Множитель к ставке за стоимость движка (тысячные) с учётом коэффициента выплат. */
const toX = (units: number) => (units * PAYOUT_NUM) / PAYOUT_DEN / 1000;
const fmtX = (x: number) => (x >= 10 ? String(Math.round(x)) : x < 0.1 ? x.toFixed(3) : x.toFixed(2));
const chestMin = toX(Math.min(...CHEST_TABLE.map(([v]) => v)));
const chestMax = toX(Math.max(...CHEST_TABLE.map(([v]) => v)));

function Sprite({ id }: { id: BlockId }) {
  const src = BLOCK_IMAGE[id];
  if (src) return <span className="md-sheetSprite" style={{ backgroundImage: `url(${src})` }} />;
  return (
    <span className="md-sheetSprite md-sheetSprite--flat" data-block={id} style={{ background: BLOCK_COLOR[id] }}>
      {id === 'tnt' ? 'TNT' : '↑'}
    </span>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded-button bg-white/[0.02] border border-white/5">
      <span className="flex items-center gap-2 font-medium text-zinc-200">{left}</span>
      <span className="text-zinc-400 text-right">{right}</span>
    </div>
  );
}

export function MineDropRulesSheet({ open, onClose }: MineDropRulesSheetProps) {
  return (
    <ModalShell open={open} onClose={onClose} titleId="minedrop-rules-title" maxWidthClass="max-w-[28rem]">
      <div className="flex flex-col gap-5 text-zinc-100">
        <div>
          <h2 id="minedrop-rules-title" className="text-lg font-bold text-white mb-1">
            MineDrop — как играть
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            После ставки случайно выпадает инструмент и падает в шахту. Каждый удар по блоку снимает{' '}
            {HIT_COST} ед. прочности. От блока инструмент слегка подскакивает и бьёт снова, пока не
            пробьёт его; по пути он может задеть соседние блоки и отскочить от стенки шахты.
            Разбитая руда сразу добавляет выигрыш. Раунд заканчивается, когда инструмент ломается.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Руда — выигрыш за блок</h3>
          <div className="flex flex-col gap-1 text-xs">
            {ORE_ORDER.map((id) => (
              <Row
                key={id}
                left={
                  <>
                    <Sprite id={id} />
                    {BLOCKS[id].label}
                  </>
                }
                right={`×${fmtX(toX(BLOCKS[id].value))} ставки · ${BLOCKS[id].hp} ед. прочности`}
              />
            ))}
            <Row
              left={
                <>
                  <Sprite id="chest" />
                  Сундук
                </>
              }
              right={`×${fmtX(chestMin)}–×${fmtX(chestMax)} ставки`}
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Особые блоки</h3>
          <div className="flex flex-col gap-1 text-xs">
            <Row
              left={
                <>
                  <Sprite id="tnt" />
                  TNT
                </>
              }
              right="взрывает всё вокруг 3×3, руда засчитывается"
            />
            <Row
              left={
                <>
                  <Sprite id="repair" />
                  Починка
                </>
              }
              right={`+${REPAIR_AMOUNT} прочности`}
            />
            {PLAIN_ORDER.map((id) => (
              <Row
                key={id}
                left={
                  <>
                    <Sprite id={id} />
                    {BLOCKS[id].label}
                  </>
                }
                right={`пусто · ${BLOCKS[id].hp} ед. прочности`}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Инструменты</h3>
          <div className="flex flex-col gap-1 text-xs">
            {TOOLS.map((tool) => (
              <Row
                key={tool.id}
                left={
                  <>
                    <span className="md-sheetTool">
                      <img alt="" className="md-sheetToolImg" src={tool.image} />
                    </span>
                    {tool.label}
                  </>
                }
                right={`♥${tool.durability} · урон ${tool.power} · ${((tool.weight / TOOL_WEIGHT_TOTAL) * 100).toFixed(1)}%`}
              />
            ))}
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Чем глубже шахта — тем больше руды. Исход раунда определяется на сервере до начала анимации.
          </p>
        </div>
      </div>
    </ModalShell>
  );
}
