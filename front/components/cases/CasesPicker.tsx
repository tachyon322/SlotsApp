'use client';

import { CASES_LIST, type CaseRarity } from '@/lib/cases/engine';
import { formatMoney } from '@/components/cases/drops';

/** Стеклянный сундук для каждого кейса (по возрастанию «богатства»), арты — lg/img/cases-*.webp. */
const CASE_CHEST: Record<string, CaseRarity> = {
  common: 'common',
  rare: 'uncommon',
  legendary: 'legendary',
  mega: 'epic',
  elite: 'mythic',
};

export function caseArt(caseId: string): string {
  return `/lg/img/cases-${CASE_CHEST[caseId] ?? 'common'}.webp`;
}

export function rarityArt(rarity: CaseRarity): string {
  return `/lg/img/cases-${rarity}.webp`;
}

interface CasesPickerProps {
  activeCaseId: string;
  spinning: boolean;
  onSelect: (caseId: string) => void;
}

export function CasesPicker({ activeCaseId, spinning, onSelect }: CasesPickerProps) {
  return (
    <div className="kc-pick" role="group" aria-label="Выбор кейса">
      {CASES_LIST.map((c) => (
        <button
          key={c.id}
          type="button"
          className="kc-pickTile"
          data-case={c.id}
          aria-label={c.ariaLabel}
          aria-pressed={activeCaseId === c.id}
          disabled={spinning}
          onClick={() => onSelect(c.id)}
        >
          <i className="kc-art" style={{ backgroundImage: `url(${caseArt(c.id)})` }} aria-hidden="true" />
          <span>{c.name.replace(' кейс', '')}</span>
          <b>{formatMoney(c.price)}</b>
        </button>
      ))}
    </div>
  );
}
