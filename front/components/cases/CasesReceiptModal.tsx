'use client';

import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { CASES_LIST, RARITY_STYLES } from '@/lib/cases/engine';
import type { CasesHistoryItem } from '@/lib/api';
import { LgSheet } from '@/components/ui/LgSheet';
import { formatMoney } from '@/components/cases/drops';
import { caseArt } from '@/components/cases/CasesPicker';
import { whenLabel } from '@/components/cases/CasesHistory';

interface CasesReceiptModalProps {
  open: boolean;
  onClose: () => void;
  item: CasesHistoryItem | null;
}

export function CasesReceiptModal({ open, onClose, item }: CasesReceiptModalProps) {
  const visible = open && !!item;

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, onClose]);

  if (!visible || !item) return null;

  const rarity = RARITY_STYLES[item.rarity] || RARITY_STYLES.common;
  const net = item.payout - item.bet;
  const caseName = CASES_LIST.find((c) => c.id === item.caseId)?.name || item.caseId;

  return (
    <LgSheet titleId="cases-receipt-title" title={`Раунд #${item.id.slice(0, 8)}`} onClose={onClose}>
      <div className="kc-sheetCase">
        <i className="kc-art" style={{ backgroundImage: `url(${caseArt(item.caseId)})` }} aria-hidden="true" />
        <div>
          <b>{caseName}</b>
          <small>{whenLabel(item.createdAt)}</small>
        </div>
        <span className="kc-net" data-tone={net > 0 ? 'pos' : 'neg'}>
          {net > 0 ? `+${formatMoney(net)}` : `−${formatMoney(-net)}`}
        </span>
      </div>

      <div className="ls-kv">
        <div>
          Линий <b>{item.lines}</b>
        </div>
        <div>
          Ставка за линию <b>{formatMoney(item.lineBet)}</b>
        </div>
        <div>
          Общая ставка <b>{formatMoney(item.bet)}</b>
        </div>
        <div>
          Лучшая редкость <b style={{ color: rarity.color }}>{rarity.label}</b>
        </div>
        <div>
          Итоговый множитель <b>×{item.multiplier.toFixed(2)}</b>
        </div>
        <div>
          Приз <b data-tone={net > 0 ? 'pos' : undefined}>{formatMoney(item.payout)}</b>
        </div>
      </div>

      <p className="ls-note">
        <ShieldCheck aria-hidden="true" />
        Результат раунда подтвержден криптографическим хэшем (Provably Fair).
      </p>
    </LgSheet>
  );
}
