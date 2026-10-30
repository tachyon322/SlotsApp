'use client';

import { useEffect, type CSSProperties } from 'react';
import { CASES_LIST, RARITY_STYLES } from '@/lib/cases/engine';
import { LgSheet } from '@/components/ui/LgSheet';
import {
  DROPS_DEFINITION,
  MAX_PAYOUT_PER_ROUND,
  formatChance,
  formatMoney,
  formatMultRange,
} from '@/components/cases/drops';
import { caseArt } from '@/components/cases/CasesPicker';

interface CasesContentsModalProps {
  open: boolean;
  onClose: () => void;
  activeCaseId: string;
}

export function CasesContentsModal({ open, onClose, activeCaseId }: CasesContentsModalProps) {
  // Скролл body и Escape (LgSheet — чистая разметка).
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const activeCase = CASES_LIST.find((c) => c.id === activeCaseId) || CASES_LIST[0];

  return (
    <LgSheet titleId="cases-contents-title" title="Что внутри" onClose={onClose}>
      <div className="kc-sheetCase">
        <i className="kc-art" style={{ backgroundImage: `url(${caseArt(activeCase.id)})` }} aria-hidden="true" />
        <div>
          <b>{activeCase.name}</b>
          <small>{formatMoney(activeCase.price)} за линию</small>
        </div>
      </div>

      <ul className="kc-drops">
        {DROPS_DEFINITION.map((row, i) => {
          const color = RARITY_STYLES[row.rarity].color;
          // Приз карточки = цена × множитель; выплата за раунд ограничена потолком.
          const prize = (m: number) => Math.min(MAX_PAYOUT_PER_ROUND, Math.floor(activeCase.price * m));
          const lo = prize(row.multipliers[0]);
          const hi = prize(row.multipliers[row.multipliers.length - 1]);
          return (
            <li key={i} style={{ '--r': color } as CSSProperties}>
              <span className="kc-drops-name">
                <i aria-hidden="true" />
                {row.rarityName}
              </span>
              <span className="kc-drops-prize">
                <b>
                  {lo === hi
                    ? formatMoney(lo)
                    : `${lo.toLocaleString('ru-RU')}–${formatMoney(hi)}`}
                </b>
                <small>{formatMultRange(row.multipliers)}</small>
              </span>
              <span className="kc-drops-chance">{formatChance(row.chance)}</span>
            </li>
          );
        })}
      </ul>

      <p className="ls-note">
        Каждая линия — отдельное открытие кейса по той же цене. Приз линии — карточка под маркером. Выплата
        за раунд — не больше {formatMoney(MAX_PAYOUT_PER_ROUND)}.
      </p>
    </LgSheet>
  );
}
