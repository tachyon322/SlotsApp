'use client';

import React from 'react';
import { CASES_LIST } from '@/lib/cases/engine';
import { CasesSheet } from '@/components/cases/CasesSheet';
import { DROPS_DEFINITION, LEGEND_ITEMS, formatMoney } from '@/components/cases/drops';

interface CasesContentsModalProps {
  open: boolean;
  onClose: () => void;
  activeCaseId: string;
}

export function CasesContentsModal({ open, onClose, activeCaseId }: CasesContentsModalProps) {
  const activeCase = CASES_LIST.find((c) => c.id === activeCaseId) || CASES_LIST[0];

  return (
    <CasesSheet
      open={open}
      onClose={onClose}
      label={`Содержимое: ${activeCase.name}`}
      title={`${activeCase.name} — содержимое`}
    >
      <ul className="cs-contentsList">
        {DROPS_DEFINITION.map((row, idx) => {
          const prizeAmount = formatMoney(
            Number((activeCase.price * row.multFactor).toFixed(2)),
          );

          return (
            <li key={idx} className="cs-contentsRow">
              <span
                className="cs-contentsSwatch"
                style={{ background: row.swatchGradient }}
                aria-hidden="true"
              />
              <span className="cs-contentsRarity" style={{ color: row.rarityColor }}>
                {row.rarityName}
              </span>
              <span className="cs-contentsMult">{row.multText}</span>
              <span className="cs-contentsPrize">{prizeAmount}</span>
              <span className="cs-contentsChance">{row.chanceText}</span>
            </li>
          );
        })}
      </ul>

      <div className="cs-legend" aria-hidden="true">
        {LEGEND_ITEMS.map((item, idx) => (
          <span key={idx} className="cs-legendItem">
            <span className="cs-legendDot" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </CasesSheet>
  );
}
