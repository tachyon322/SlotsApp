'use client';

import { LgSheet } from '@/components/ui/LgSheet';
import { useSheetChrome } from '@/components/ui/useSheetChrome';
import {
  JACKPOT_CHANCE,
  JACKPOT_MAX,
  JACKPOT_MIN,
  LOSS_BAND,
  WIN_BAND,
} from '@/lib/minedrop/economy';
import {
  BLOCKS,
  CHEST_TABLE,
  HIT_COST,
  MAX_MULTIPLIER,
  PAYOUT_DEN,
  PAYOUT_NUM,
  REPAIR_AMOUNT,
  TOOLS,
  type BlockId,
} from '@/lib/minedrop/pickaxeEngine';
import { BlockIcon, ToolIcon } from '@/components/minedrop/art';

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

const STEPS = [
  'После ставки на рулетке выпадает случайный инструмент и падает в шахту.',
  `Каждый удар по блоку снимает ${HIT_COST} ед. прочности инструмента. От блока он слегка подскакивает и бьёт снова, пока не пробьёт его.`,
  'По пути инструмент задевает соседние блоки и отскакивает от стенок шахты. Чем глубже — тем больше руды.',
  'Разбитая руда сразу добавляет выигрыш. Раунд заканчивается, когда инструмент ломается.',
];

export function MineDropRulesSheet({ open, onClose }: MineDropRulesSheetProps) {
  useSheetChrome(open, onClose);
  if (!open) return null;

  return (
    <LgSheet titleId="minedrop-rules-title" title="Правила MineDrop" onClose={onClose}>
      <ol className="md2-steps">
        {STEPS.map((text, i) => (
          <li key={i}>
            <i>{i + 1}</i>
            <span>{text}</span>
          </li>
        ))}
      </ol>
      <p className="md2-formula">
        Выигрыш = сумма руды × ставка · максимум ×{MAX_MULTIPLIER} · исход раунда определяется на сервере до
        начала анимации
      </p>

      <h3 className="md2-sheetH">Выплата за раунд</h3>
      <ul className="md2-table">
        <li>
          <span>
            Выигрышный раунд
            <small>руда дороже ставки</small>
          </span>
          <b>×{WIN_BAND[0]}–×{WIN_BAND[1]}</b>
        </li>
        <li>
          <span>
            Частичный возврат
            <small>руда дешевле ставки</small>
          </span>
          <b>×{LOSS_BAND[0]}–×{LOSS_BAND[1]}</b>
        </li>
        <li>
          <span>
            Джекпот
            <small>редко · {(JACKPOT_CHANCE * 100).toFixed(1)}% раундов</small>
          </span>
          <b data-tone="gold">от ×{JACKPOT_MIN} до ×{JACKPOT_MAX}</b>
        </li>
      </ul>
      <p className="md2-formula">
        Шанс выигрыша зависит от текущего баланса: чем выше баланс, тем он ниже
      </p>

      <h3 className="md2-sheetH">Руда — выигрыш за блок</h3>
      <ul className="md2-table">
        {ORE_ORDER.map((id) => (
          <li key={id}>
            <BlockIcon id={id} />
            <span>
              {BLOCKS[id].label}
              <small>прочность {BLOCKS[id].hp}</small>
            </span>
            <b>×{fmtX(toX(BLOCKS[id].value))}</b>
          </li>
        ))}
        <li>
          <BlockIcon id="chest" />
          <span>
            {BLOCKS.chest.label}
            <small>прочность {BLOCKS.chest.hp}</small>
          </span>
          <b data-tone="gold">
            ×{fmtX(chestMin)}–×{fmtX(chestMax)}
          </b>
        </li>
      </ul>

      <h3 className="md2-sheetH">Особые блоки</h3>
      <ul className="md2-table">
        <li>
          <BlockIcon id="tnt" />
          <span>
            TNT
            <small>взрывает всё вокруг, руда засчитывается</small>
          </span>
          <b>3×3</b>
        </li>
        <li>
          <BlockIcon id="repair" />
          <span>
            {BLOCKS.repair.label}
            <small>чинит инструмент</small>
          </span>
          <b>+{REPAIR_AMOUNT} ♥</b>
        </li>
        {PLAIN_ORDER.map((id) => (
          <li key={id}>
            <BlockIcon id={id} />
            <span>
              {BLOCKS[id].label}
              <small>прочность {BLOCKS[id].hp}</small>
            </span>
            <b data-tone="dim">пусто</b>
          </li>
        ))}
      </ul>

      <h3 className="md2-sheetH">Инструменты</h3>
      <ul className="md2-table">
        {TOOLS.map((tool) => (
          <li key={tool.id}>
            <ToolIcon tool={tool} />
            <span>
              {tool.label}
              <small>
                ♥ {tool.durability} · урон {tool.power}
              </small>
            </span>
            <b data-tone="dim">{((tool.weight / TOOL_WEIGHT_TOTAL) * 100).toFixed(1)}%</b>
          </li>
        ))}
      </ul>
    </LgSheet>
  );
}
