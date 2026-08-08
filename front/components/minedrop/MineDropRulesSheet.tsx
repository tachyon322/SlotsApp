'use client';

import { ModalShell } from '@/components/ModalShell';
import {
  BLOCK_IMAGE,
  BLOCK_PRICE,
  TOOLS,
} from '@/lib/minedrop/engine';

interface MineDropRulesSheetProps {
  open: boolean;
  onClose: () => void;
}

const BLOCK_ORDER: Array<[string, string]> = [
  ['grass', 'Трава'],
  ['dirt', 'Земля'],
  ['stone', 'Камень'],
  ['redstone', 'Редстоун'],
  ['coal', 'Уголь'],
  ['iron', 'Железо'],
  ['gold', 'Золото'],
  ['diamond', 'Алмаз'],
  ['chest', 'Сундук'],
];

export function MineDropRulesSheet({ open, onClose }: MineDropRulesSheetProps) {
  return (
    <ModalShell open={open} onClose={onClose} titleId="minedrop-rules-title" maxWidthClass="max-w-[28rem]">
      <div className="flex flex-col gap-5 text-zinc-100">
        <div>
          <h2 id="minedrop-rules-title" className="text-lg font-bold text-white mb-1">
            MineDrop — как играть
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Инструменты падают сверху и крушат блоки колонна за колонной. Чем глубже копаешь — тем
            дороже блок. Комбо одинаковых инструментов бьют сильнее, Око Эндера бьёт молниями, а
            сундук внизу — джекпот.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Блоки</h3>
          <div className="flex flex-col gap-1 text-xs">
            {BLOCK_ORDER.map(([id, label]) => (
              <div key={id} className="flex items-center justify-between px-2 py-1.5 rounded-button bg-white/[0.02] border border-white/5">
                <span className="flex items-center gap-2">
                  <span
                    className="minedrop_sheetSprite"
                    style={{ backgroundImage: `url(${BLOCK_IMAGE[id]})` }}
                  />
                  <span className="font-medium text-zinc-200">{label}</span>
                </span>
                <span className="text-zinc-400">
                  {id === 'chest' ? 'джекпот' : `${BLOCK_PRICE[id]} ₽`}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Инструменты</h3>
          <div className="flex flex-col gap-1 text-xs">
            {TOOLS.map((tool) => (
              <div key={tool.id} className="flex items-center justify-between px-2 py-1.5 rounded-button bg-white/[0.02] border border-white/5">
                <span className="flex items-center gap-2">
                  <span className="minedrop_sheetTool">
                    <img alt="" className="minedrop_sheetToolImg" src={tool.image} />
                  </span>
                  <span className="font-medium text-zinc-200">{tool.label}</span>
                </span>
                <span className="text-zinc-400">
                  {tool.eye ? 'молнии' : `урон ${tool.damage}`}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-2 py-1.5 rounded-button bg-white/[0.02] border border-white/5">
              <span className="flex items-center gap-2">
                <span className="minedrop_sheetTool">
                  <span className="minedrop_slotMark minedrop_slotMark--empty" aria-hidden="true">
                    ✕
                  </span>
                </span>
                <span className="font-medium text-zinc-200">Пусто</span>
              </span>
              <span className="text-zinc-400">пусто</span>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
