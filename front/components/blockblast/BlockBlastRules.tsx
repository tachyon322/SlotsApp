'use client';

import { LgSheet } from '@/components/ui/LgSheet';
import { MAX_MULT, TARGET_PLACEMENTS, formatMultiplier, moveTime } from '@/lib/blockblast/engine';
import { MAX_MULT_AT, REFUND_CAP_AT, percent, refundRatio } from '@/components/blockblast/rules';
import { useSheetChrome } from '@/components/ui/useSheetChrome';

interface BlockBlastRulesProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  'Перетаскивайте фигуры из лотка на поле 8\u00a0×\u00a08. Вращать их нельзя. Можно и тапнуть фигуру, а потом клетку.',
  'Заполненные целиком строки и столбцы сгорают — освобождают место и сразу дают бонус.',
  'На каждый ход — таймер, с каждой фигурой времени меньше.',
  `С ${TARGET_PLACEMENTS}-й фигуры можно забрать выигрыш. Дальше множитель растёт, но поле теснее.`,
  'Если фигуру некуда поставить или время вышло — раунд заканчивается.',
];

export function BlockBlastRules({ open, onClose }: BlockBlastRulesProps) {
  useSheetChrome(open, onClose);
  if (!open) return null;

  return (
    <LgSheet titleId="blockblast-rules-title" title="Правила BlockBlast" onClose={onClose}>
      <ol className="bx-steps">
        {STEPS.map((text, i) => (
          <li key={i}>
            <i>{i + 1}</i>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <h3 className="bx-sheetH">Выплаты</h3>
      <div className="ls-kv">
        <div>
          Тупик на 1–{REFUND_CAP_AT - 1}-й фигуре
          <b>
            {percent(refundRatio(1))}–{percent(refundRatio(REFUND_CAP_AT - 1))} ставки
          </b>
        </div>
        <div>
          Тупик на {REFUND_CAP_AT}–{TARGET_PLACEMENTS - 1}-й фигуре <b>{percent(refundRatio(REFUND_CAP_AT))} ставки</b>
        </div>
        <div>
          Кэшаут на {TARGET_PLACEMENTS}-й фигуре <b>{formatMultiplier(1.5)}</b>
        </div>
        <div>
          Каждая следующая фигура <b>+0.1</b>
        </div>
        <div>
          С {MAX_MULT_AT}-й фигуры <b>{formatMultiplier(MAX_MULT)}</b>
        </div>
        <div>
          Сгоревшая линия <b data-tone="pos">+10% ставки</b>
        </div>
        <div>
          Время на ход
          <b>
            {moveTime(0)} с → минимум {moveTime(99)} с
          </b>
        </div>
      </div>
      <p className="ls-note">Возврат и выигрыш зачисляются на баланс сразу после окончания раунда.</p>
    </LgSheet>
  );
}
