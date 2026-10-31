'use client';

import { Zap } from 'lucide-react';
import { LgSheet } from '@/components/ui/LgSheet';
import { useSheetChrome } from '@/components/ui/useSheetChrome';
import { BLOCK_PRICE, TOOLS, effectiveDamage } from '@/lib/minedrop/engine';
import { BLOCK_NAME, BLOCK_ORDER, MAX_ROUND_MULT, blockArt, pointsToMultiplier } from '@/components/minedrop/art';
import { Tool } from '@/components/minedrop/MineDropStage';

interface MineDropRulesSheetProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  'Над каждой из 5 колонн выпадают 3 инструмента, иногда пустой слот.',
  'Урон инструментов в колонне складывается. Два одинаковых бьют ×1.5, три — ×2.',
  'Блоки ломаются сверху вниз, пока хватает урона. Очки колонны — сумма прочности сломанных блоков.',
  'Око Эндера бьёт молнией: колонна пробита до сундука, +250 очков.',
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
        Множитель = очки × 0.01653 · 100 очков = {`×${pointsToMultiplier(100).toFixed(2)}`} · максимум ×
        {MAX_ROUND_MULT.toFixed(2)}
      </p>

      <h3 className="md2-sheetH">Блоки — прочность и очки</h3>
      <ul className="md2-table">
        {BLOCK_ORDER.map((id) => (
          <li key={id}>
            <i className="md2-tool" style={{ backgroundImage: `url(${blockArt(id)})` }} aria-hidden="true" />
            <span>{BLOCK_NAME[id]}</span>
            <b data-tone={id === 'chest' ? 'gold' : undefined}>
              {id === 'chest' ? (
                <>
                  <Zap aria-hidden="true" /> только Око · {BLOCK_PRICE.chest}
                </>
              ) : (
                BLOCK_PRICE[id]
              )}
            </b>
          </li>
        ))}
      </ul>

      <h3 className="md2-sheetH">Инструменты — урон</h3>
      <ul className="md2-table">
        {TOOLS.map((tool) => (
          <li key={tool.id}>
            <Tool id={tool.id} />
            <span>{tool.label}</span>
            <b data-tone={tool.eye ? 'gold' : undefined}>{tool.eye ? 'молния' : effectiveDamage(tool.id)}</b>
          </li>
        ))}
        <li>
          <Tool id="empty" />
          <span>Пустой слот</span>
          <b data-tone="dim">0</b>
        </li>
      </ul>
    </LgSheet>
  );
}
