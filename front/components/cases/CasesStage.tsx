'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RARITY_STYLES, type CaseRarity } from '@/lib/cases/engine';
import type { CaseLineResult } from '@/lib/api';

interface CasesStageProps {
  lines: number;
  spinning: boolean;
  spinId?: number;
  settled: boolean;
  settledLines: boolean[];
  linesData: CaseLineResult[];
  lineBet: number;
  lastPayout: number;
  lastMultiplier: number;
  outcome: 'win' | 'loss' | 'neutral' | null;
  maxRarity: CaseRarity | null;
}

export function CasesStage({
  lines,
  spinning,
  spinId = 0,
  settled,
  settledLines,
  linesData,
  lineBet,
  lastPayout,
  lastMultiplier,
  outcome,
  maxRarity,
}: CasesStageProps) {
  const isCompact = lines === 3;
  const cardWidth = isCompact ? 100 : 130;
  const gap = 12;
  const itemStep = cardWidth + gap;

  // Track whether strip is resetting to 0px before starting spin transition
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (spinning) {
      setIsResetting(true);
      const timer = setTimeout(() => {
        setIsResetting(false);
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [spinId, spinning]);

  // Staggered transition durations for each line
  const transitionDurations = [2500, 3150, 3800];

  return (
    <section className="cases_stage__jzPo6" data-bigwin={lastMultiplier >= 10 ? "true" : "false"} aria-label="Призовая рулетка">
      <div className="cases_reel__xTKcf" data-lines={lines} aria-label="Призовые рулетки">
        <ChevronDown className="cases_cursorTop__chCty" aria-hidden="true" />
        <ChevronUp className="cases_cursorBottom__7eI4y" aria-hidden="true" />

        {Array.from({ length: lines }).map((_, lineIdx) => {
          const lineResult = linesData[lineIdx];
          const isLineSettled = settledLines[lineIdx] ?? true;
          const duration = transitionDurations[lineIdx] || 2500;

          // If line data is available (after API response received or spinning/settled)
          const stripData = lineResult?.strip || [];
          const winnerIndex = lineResult?.winnerIndex ?? 38;
          const linePayout = lineResult?.linePayout ?? 0;
          const winningCard = lineResult?.winningCard;

          // Target translate position when spinning or settled
          const targetOffset = winnerIndex * itemStep + cardWidth / 2;

          return (
            <div key={lineIdx} className="cases_trackRow__63Ysl" data-settled={isLineSettled ? "true" : "false"}>
              {lines > 1 && (
                <span className="cases_trackBadge__Cvevh" data-line={lineIdx + 1}>
                  Линия {lineIdx + 1}
                </span>
              )}

              <div className="cases_track__litr4" role="img" aria-label={`Линия ${lineIdx + 1}`}>
                <span className="cases_cursorLine__nTc_P" aria-hidden="true"></span>

                {!lineResult && !spinning ? (
                  /* Idle demo row */
                  <div className="cases_idleRow__n6552">
                    <IdleCard lineBet={lineBet} rarity="legendary" mult={7.2} compact={isCompact} />
                    <IdleCard lineBet={lineBet} rarity="mythic" mult={48.3} compact={isCompact} isWinner={true} />
                    <IdleCard lineBet={lineBet} rarity="epic" mult={2.4} compact={isCompact} />
                  </div>
                ) : (
                  /* Animated Strip */
                  <div
                    className="cases_strip__d7jSF"
                    data-settled={isLineSettled ? "true" : "false"}
                    style={{
                      transition: spinning && !isResetting
                        ? `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`
                        : 'none',
                      transform: (spinning && !isResetting) || settled
                        ? `translate(-${targetOffset}px, -50%)`
                        : 'translate(0px, -50%)',
                    }}
                  >
                    {stripData.map((card, idx) => {
                      const isWinner = isLineSettled && idx === winnerIndex;
                      const styleDef = RARITY_STYLES[card.rarity] || RARITY_STYLES.common;
                      const bg = isWinner ? styleDef.winnerGradient : styleDef.bgGradient;

                      return (
                        <div
                          key={idx}
                          className="cases_card__VeCiL"
                          data-winner={isWinner ? "true" : "false"}
                          data-compact={isCompact ? "true" : "false"}
                          data-rarity={card.rarity}
                          style={{
                            background: bg,
                            borderColor: styleDef.borderColor,
                            '--rarity-glow': styleDef.glowColor,
                          } as React.CSSProperties}
                        >
                          <span className="cases_cardPrize__Km5C6" data-size={card.prize >= 1000 ? "md" : "lg"}>
                            {card.prize.toLocaleString('ru-RU')} ₽
                          </span>
                          <span className="cases_cardMult__7UkFT">×{card.multiplier}</span>
                          {!isCompact && (
                            <span className="cases_cardRarity__d3fkr">{card.rarityLabel}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Per-line win badge if multi-line settled */}
              {lines > 1 && settled && winningCard && (
                <div className="cases_lineBadge__VcERu">
                  <span
                    className="cases_lineBadgeRarity__qggJg"
                    style={{
                      color: RARITY_STYLES[winningCard.rarity].color,
                      borderColor: RARITY_STYLES[winningCard.rarity].borderColor,
                    }}
                  >
                    {winningCard.rarityLabel}
                  </span>
                  <span className="cases_lineBadgeAmount__m6Mxq" data-zero={linePayout === 0 ? "true" : "false"}>
                    +{linePayout.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Status Bar below stage */}
      {settled && outcome && (
        <div className="cases_status__RL4qu">
          {lines === 1 ? (
            <>
              {maxRarity && (
                <span
                  className="cases_statusTag__OmN2Q"
                  style={{
                    color: RARITY_STYLES[maxRarity].color,
                    borderColor: RARITY_STYLES[maxRarity].borderColor,
                  }}
                >
                  {RARITY_STYLES[maxRarity].label} дроп
                </span>
              )}
              <span
                className={`cases_statusAmount__dra_5 ${
                  outcome === 'win'
                    ? 'cases_statusWin__win'
                    : 'cases_statusNeutral__ctgc_'
                }`}
              >
                {outcome === 'win'
                  ? `ВЫИГРЫШ ${lastPayout.toLocaleString('ru-RU')} ₽`
                  : `ВОЗВРАТ ${lastPayout.toLocaleString('ru-RU')} ₽`}
              </span>
            </>
          ) : (
            <>
              {maxRarity && (
                <span
                  className="cases_statusTag__OmN2Q"
                  style={{
                    color: RARITY_STYLES[maxRarity].color,
                    borderColor: RARITY_STYLES[maxRarity].borderColor,
                  }}
                >
                  {lines} линии · {RARITY_STYLES[maxRarity].label}
                </span>
              )}
              <span className="cases_statusCaption__Pb1BS">
                {outcome === 'win' ? 'Выигрыш' : 'Возврат'}
              </span>
              <span
                className={`cases_statusBigSum__D3TNe ${
                  outcome === 'win' ? 'cases_statusWin__win' : 'cases_statusNeutral__ctgc_'
                }`}
              >
                {lastPayout.toLocaleString('ru-RU')} ₽
              </span>
              <div className="cases_statusAgg__cI8nj">
                <span>
                  Множитель <strong>×{lastMultiplier}</strong>
                </span>
                <span>
                  Итог{' '}
                  <strong className={lastPayout >= lineBet * lines ? 'cases_statusWin__win' : 'cases_statusLossInline__rUc_2'}>
                    {lastPayout >= lineBet * lines
                      ? `+${(lastPayout - lineBet * lines).toLocaleString('ru-RU')} ₽`
                      : `−${(lineBet * lines - lastPayout).toLocaleString('ru-RU')} ₽`}
                  </strong>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function IdleCard({
  lineBet,
  rarity,
  mult,
  compact,
  isWinner = false,
}: {
  lineBet: number;
  rarity: CaseRarity;
  mult: number;
  compact: boolean;
  isWinner?: boolean;
}) {
  const styleDef = RARITY_STYLES[rarity];
  const prize = Number((lineBet * mult).toFixed(2));
  const bg = isWinner ? styleDef.winnerGradient : styleDef.bgGradient;

  return (
    <div
      className="cases_card__VeCiL"
      data-winner={isWinner ? "true" : "false"}
      data-compact={compact ? "true" : "false"}
      style={{
        background: bg,
        borderColor: styleDef.borderColor,
        '--rarity-glow': styleDef.glowColor,
      } as React.CSSProperties}
    >
      <span className="cases_cardPrize__Km5C6" data-size={prize >= 1000 ? "md" : "lg"}>
        {prize.toLocaleString('ru-RU')} ₽
      </span>
      <span className="cases_cardMult__7UkFT">×{mult}</span>
      {!compact && <span className="cases_cardRarity__d3fkr">{styleDef.label}</span>}
    </div>
  );
}
