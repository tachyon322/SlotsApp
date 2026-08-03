'use client';

import React from 'react';
import { ModalShell } from '@/components/ModalShell';
import { CASES_LIST } from '@/lib/cases/engine';

interface CasesContentsModalProps {
  open: boolean;
  onClose: () => void;
  activeCaseId: string;
}

interface DropRowItem {
  rarityName: string;
  rarityColor: string;
  swatchGradient: string;
  multText: string;
  multFactor: number;
  chanceText: string;
}

const DROPS_DEFINITION: DropRowItem[] = [
  {
    rarityName: 'Мифический',
    rarityColor: 'rgb(255, 121, 225)',
    swatchGradient: 'linear-gradient(135deg, rgb(255, 79, 216) 0%, rgb(139, 92, 246) 48%, rgb(52, 211, 224) 100%)',
    multText: '×48.3',
    multFactor: 48.3951,
    chanceText: '0.50%',
  },
  {
    rarityName: 'Легендарный',
    rarityColor: 'rgb(255, 191, 77)',
    swatchGradient: 'linear-gradient(160deg, rgb(255, 194, 77) 0%, rgb(240, 118, 60) 100%)',
    multText: '×7.2',
    multFactor: 7.2593,
    chanceText: '2.5%',
  },
  {
    rarityName: 'Эпический',
    rarityColor: 'rgb(184, 132, 255)',
    swatchGradient: 'linear-gradient(160deg, rgb(176, 123, 255) 0%, rgb(124, 58, 237) 100%)',
    multText: '×2.4',
    multFactor: 2.4198,
    chanceText: '7.0%',
  },
  {
    rarityName: 'Необычный',
    rarityColor: 'rgb(76, 195, 245)',
    swatchGradient: 'linear-gradient(160deg, rgb(76, 195, 245) 0%, rgb(29, 159, 212) 100%)',
    multText: '×0.9',
    multFactor: 0.9679,
    chanceText: '15.0%',
  },
  {
    rarityName: 'Обычный',
    rarityColor: 'rgb(154, 166, 187)',
    swatchGradient: 'linear-gradient(160deg, rgb(135, 148, 168) 0%, rgb(81, 91, 110) 100%)',
    multText: '×0.4',
    multFactor: 0.4839,
    chanceText: '25.0%',
  },
  {
    rarityName: 'Обычный',
    rarityColor: 'rgb(154, 166, 187)',
    swatchGradient: 'linear-gradient(160deg, rgb(135, 148, 168) 0%, rgb(81, 91, 110) 100%)',
    multText: '×0.2',
    multFactor: 0.2419,
    chanceText: '50.0%',
  },
];

const LEGEND_ITEMS = [
  { label: 'Обычный', color: 'rgb(154, 166, 187)' },
  { label: 'Необычный', color: 'rgb(76, 195, 245)' },
  { label: 'Редкий', color: 'rgb(91, 155, 255)' },
  { label: 'Эпический', color: 'rgb(184, 132, 255)' },
  { label: 'Легендарный', color: 'rgb(255, 191, 77)' },
  { label: 'Мифический', color: 'rgb(255, 121, 225)' },
];

export function CasesContentsModal({ open, onClose, activeCaseId }: CasesContentsModalProps) {
  const activeCase = CASES_LIST.find((c) => c.id === activeCaseId) || CASES_LIST[0];

  return (
    <ModalShell open={open} onClose={onClose} titleId="cases-contents-modal-title" maxWidthClass="max-w-[40rem]">
      <div className="cases_sheet__H_q28" role="dialog" aria-modal="true" aria-label={`Содержимое: ${activeCase.name}`}>
        <div className="cases_sheetHead__95DiH">
          <strong id="cases-contents-modal-title" className="cases_sheetTitle__D5bwN">
            {activeCase.name} — содержимое
          </strong>
        </div>

        <ul className="cases_contentsList__d4G04">
          {DROPS_DEFINITION.map((row, idx) => {
            const prizeAmount = (activeCase.price * row.multFactor).toLocaleString('ru-RU', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });

            return (
              <li key={idx} className="cases_contentsRow__XLiPU">
                <span
                  className="cases_contentsSwatch__kHivG"
                  style={{ background: row.swatchGradient }}
                  aria-hidden="true"
                />
                <span
                  className="cases_contentsRarity__QwffW"
                  style={{ color: row.rarityColor }}
                >
                  {row.rarityName}
                </span>
                <span className="cases_contentsMult__hg5LI">{row.multText}</span>
                <span className="cases_contentsPrize__JgS9l">{prizeAmount} ₽</span>
                <span className="cases_contentsChance__KF89b">{row.chanceText}</span>
              </li>
            );
          })}
        </ul>

        <div className="cases_legend__sMVAi" aria-hidden="true">
          {LEGEND_ITEMS.map((item, idx) => (
            <span key={idx} className="cases_legendItem__xIO8S">
              <span
                className="cases_legendDot___lsru"
                style={{ background: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
