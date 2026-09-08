'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { CASES_LIST, RARITY_STYLES } from '@/lib/cases/engine';
import type { CasesHistoryItem } from '@/lib/api';
import { CasesSheet } from '@/components/cases/CasesSheet';
import { formatMoney } from '@/components/cases/drops';

interface CasesReceiptModalProps {
  open: boolean;
  onClose: () => void;
  item: CasesHistoryItem | null;
}

export function CasesReceiptModal({ open, onClose, item }: CasesReceiptModalProps) {
  if (!item) return null;

  const rarityStyle = RARITY_STYLES[item.rarity] || RARITY_STYLES.common;
  const net = item.payout - item.bet;
  const caseName = CASES_LIST.find((c) => c.id === item.caseId)?.name || item.caseId;

  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Кейс', value: <span className="uppercase">{caseName}</span> },
    { label: 'Количество линий', value: item.lines },
    { label: 'Ставка за линию', value: formatMoney(item.lineBet) },
    { label: 'Общая ставка', value: formatMoney(item.bet) },
    {
      label: 'Выпавшая редкость',
      value: (
        <span
          className="cs-rarityTag"
          style={{ color: rarityStyle.color, borderColor: rarityStyle.borderColor }}
        >
          {rarityStyle.label}
        </span>
      ),
    },
    { label: 'Итоговый множитель', value: `×${item.multiplier.toFixed(2)}` },
    { label: 'Приз', value: formatMoney(item.payout) },
  ];

  return (
    <CasesSheet
      open={open}
      onClose={onClose}
      label="Чек раунда"
      title={<>Чек раунда #{item.id.slice(0, 8)}</>}
    >
      <div className="cs-receiptRows">
        {rows.map((row) => (
          <div key={row.label} className="cs-receiptRow">
            <span className="cs-receiptLabel">{row.label}</span>
            <span className="cs-receiptValue">{row.value}</span>
          </div>
        ))}
        <div className="cs-receiptRow" data-total="true">
          <span className="cs-receiptLabel">Итог раунда</span>
          <span
            className="cs-receiptValue"
            data-tone={net >= 0 ? 'green' : 'loss'}
          >
            {net >= 0 ? `+${formatMoney(net)}` : `−${formatMoney(-net)}`}
          </span>
        </div>
      </div>

      <div className="cs-receiptFair">
        <ShieldCheck className="cs-receiptFairIcon" aria-hidden="true" />
        <span>Результат раунда подтвержден криптографическим хэшем (Provably Fair).</span>
      </div>
    </CasesSheet>
  );
}
