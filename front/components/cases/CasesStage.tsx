'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RARITY_STYLES, type CaseRarity } from '@/lib/cases/engine';
import type { CaseLineResult } from '@/lib/api';
import { DROPS_DEFINITION, IDLE_ORDER, formatMoney, formatMult } from '@/components/cases/drops';

interface CasesStageProps {
  lines: number;
  spinning: boolean;
  spinId?: number;
  settled: boolean;
  settledLines: boolean[];
  linesData: CaseLineResult[];
  lineBet: number;
  caseName: string;
  bigWin: boolean;
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
  caseName,
  bigWin,
  lastPayout,
  lastMultiplier,
  outcome,
  maxRarity,
}: CasesStageProps) {
  const isCompact = lines === 3;

  // Ширина карточки задаётся в CSS через calc(100cqw / var(--case-visible-items) - Npx),
  // т.е. зависит от ширины трека. Шаг прокрутки нельзя зашивать константой: на узких
  // экранах лента (45 × шаг) короче дистанции до победителя, лента «уезжает за свой
  // конец» и трек визуально пустеет. Поэтому шаг измеряем по факту и пересчитываем
  // на ресайз. До первого замера — десктопные константы (прежнее поведение).
  const reelRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ step: 142, trackWidth: 994 });

  useEffect(() => {
    const reel = reelRef.current;
    const track = reel?.querySelector<HTMLElement>('.cs-track');
    if (!reel || !track) return;

    const measure = () => {
      // cqw считается от content-box контейнера, поэтому вычитаем паддинг и бордер
      const cs = getComputedStyle(track);
      const trackWidth =
        track.getBoundingClientRect().width -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight) -
        parseFloat(cs.borderLeftWidth) -
        parseFloat(cs.borderRightWidth);
      if (!Number.isFinite(trackWidth) || trackWidth <= 0) return;
      const visible =
        parseFloat(getComputedStyle(reel).getPropertyValue('--case-visible-items')) || 3;
      const step = trackWidth / visible;
      setMetrics((prev) =>
        prev.step === step && prev.trackWidth === trackWidth ? prev : { step, trackWidth },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  // Rest position of the strip at spin start. The strip is anchored at the track
  // center (left: 50%), so offset 0 would put card #1 right at the cursor. Pushing
  // it past the track's right edge keeps every card off the visible window, so the
  // reset is invisible and cards sweep in from the right as the spin starts.
  const resetOffset = Math.max(600, metrics.trackWidth / 2 + metrics.step);

  // Track whether strip is resetting to the off-window offset before starting
  // the spin transition
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
    <section className="cs-stage" data-bigwin={bigWin} aria-label="Призовая рулетка">
      {bigWin && <div className="cs-bigWinDim" aria-hidden="true" />}
      {bigWin && <strong className="cs-bigWinHeadline">БОЛЬШОЙ ВЫИГРЫШ</strong>}

      <header className="cs-stageHead">
        <div>
          <span className="cs-stageKicker">Призовые линии</span>
          <strong className="cs-stageTitle">{caseName}</strong>
        </div>
        <span className="cs-stageState" data-busy={spinning}>
          Линий: {lines}
        </span>
      </header>

      <div
        ref={reelRef}
        className="cs-reel"
        data-lines={lines}
        role="img"
        aria-label="Возможные призы"
        style={{ '--case-visible-items-desktop': 7 } as React.CSSProperties}
      >
        <span className="cs-cursorLine" aria-hidden="true" />

        {Array.from({ length: lines }).map((_, lineIdx) => {
          const lineResult = linesData[lineIdx];
          const isLineSettled = settledLines[lineIdx] ?? true;
          const duration = transitionDurations[lineIdx] || 2500;

          // If line data is available (after API response received or spinning/settled)
          const stripData = lineResult?.strip || [];
          const winnerIndex = lineResult?.winnerIndex ?? 38;
          const linePayout = lineResult?.linePayout ?? 0;
          const winningCard = lineResult?.winningCard;

          // Target translate position when spinning or settled.
          // Центр карточки idx = idx*step + step/2 (margin + basis/2), поэтому
          // победная карта встаёт ровно под линию курсора на любой ширине.
          const targetOffset = winnerIndex * metrics.step + metrics.step / 2;

          return (
            <div key={lineIdx} className="cs-trackRow" data-settled={isLineSettled}>
              {lines > 1 && (
                <span className="cs-trackBadge" data-line={lineIdx + 1}>
                  Линия {lineIdx + 1}
                </span>
              )}

              <div className="cs-track" role="img" aria-label={`Линия ${lineIdx + 1}`}>
                {!lineResult && !spinning ? (
                  /* Idle demo row (состав и порядок — 1:1 из референса) */
                  <div className="cs-idleRow">
                    {IDLE_ORDER.map((dropIdx, cardIdx) => {
                      const drop = DROPS_DEFINITION[dropIdx];
                      return (
                        <CaseCard
                          key={cardIdx}
                          rarity={drop.rarity}
                          rarityLabel={drop.rarityName}
                          prize={Number((lineBet * drop.multFactor).toFixed(2))}
                          multiplier={drop.multFactor}
                          compact={isCompact}
                          featured={drop.rarity === 'mythic'}
                        />
                      );
                    })}
                  </div>
                ) : (
                  /* Animated Strip */
                  <div
                    className="cs-strip"
                    data-settled={isLineSettled}
                    style={{
                      transition: spinning && !isResetting
                        ? `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`
                        : 'none',
                      transform: (spinning && !isResetting) || settled
                        ? `translate(-${targetOffset}px, -50%)`
                        : `translate(${resetOffset}px, -50%)`,
                    }}
                  >
                    {stripData.map((card, idx) => (
                      <CaseCard
                        key={idx}
                        rarity={card.rarity}
                        rarityLabel={card.rarityLabel}
                        prize={card.prize}
                        multiplier={card.multiplier}
                        compact={isCompact}
                        winner={isLineSettled && idx === winnerIndex}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Per-line win badge if multi-line settled */}
              {lines > 1 && settled && winningCard && (
                <div className="cs-lineBadge">
                  <span
                    className="cs-lineBadgeRarity"
                    style={{
                      color: RARITY_STYLES[winningCard.rarity].color,
                      borderColor: RARITY_STYLES[winningCard.rarity].borderColor,
                    }}
                  >
                    {winningCard.rarityLabel}
                  </span>
                  <span className="cs-lineBadgeAmount" data-zero={linePayout === 0}>
                    +{formatMoney(linePayout)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Status Bar below stage */}
      {settled && outcome && (
        <div className="cs-status">
          {lines === 1 ? (
            <>
              {maxRarity && (
                <span
                  className="cs-statusTag"
                  style={{
                    color: RARITY_STYLES[maxRarity].color,
                    borderColor: RARITY_STYLES[maxRarity].borderColor,
                  }}
                >
                  {RARITY_STYLES[maxRarity].label} дроп
                </span>
              )}
              <span
                className={`cs-statusAmount ${
                  outcome === 'win' ? 'cs-statusGreen' : 'cs-statusNeutral'
                }`}
              >
                {outcome === 'win' ? `ВЫИГРЫШ ${formatMoney(lastPayout)}` : `ВОЗВРАТ ${formatMoney(lastPayout)}`}
              </span>
            </>
          ) : (
            <>
              {maxRarity && (
                <span
                  className="cs-statusTag"
                  style={{
                    color: RARITY_STYLES[maxRarity].color,
                    borderColor: RARITY_STYLES[maxRarity].borderColor,
                  }}
                >
                  {lines} линии · {RARITY_STYLES[maxRarity].label}
                </span>
              )}
              <span className="cs-statusCaption">
                {outcome === 'win' ? 'Выигрыш' : 'Возврат'}
              </span>
              <span
                className={`cs-statusBigSum ${
                  outcome === 'win' ? 'cs-statusGreen' : 'cs-statusNeutral'
                }`}
              >
                {formatMoney(lastPayout)}
              </span>
              <div className="cs-statusAgg">
                <span>
                  Множитель <strong>×{lastMultiplier}</strong>
                </span>
                <span>
                  Итог{' '}
                  <strong
                    className={
                      lastPayout >= lineBet * lines ? 'cs-statusGreen' : 'cs-statusLossInline'
                    }
                  >
                    {lastPayout >= lineBet * lines
                      ? `+${formatMoney(lastPayout - lineBet * lines)}`
                      : `−${formatMoney(lineBet * lines - lastPayout)}`}
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

/**
 * Карточка приза референса: иллюстрированный скин (pca-illustrated) с артом
 * редкости из /images/web-polish-r2/cases-{rarity}.webp + градиент и бордер
 * из RARITY_STYLES (1:1 референсные значения).
 */
function CaseCard({
  rarity,
  rarityLabel,
  prize,
  multiplier,
  compact,
  winner = false,
  featured = false,
}: {
  rarity: CaseRarity;
  rarityLabel: string;
  prize: number;
  multiplier: number;
  compact: boolean;
  winner?: boolean;
  featured?: boolean;
}) {
  const styleDef = RARITY_STYLES[rarity] || RARITY_STYLES.common;
  const bg = winner || featured ? styleDef.winnerGradient : styleDef.bgGradient;

  return (
    <div
      className="cs-card pca-illustrated"
      data-winner={winner}
      data-featured={featured}
      data-compact={compact}
      data-rarity={rarity}
      style={{
        background: bg,
        borderColor: styleDef.borderColor,
        '--rarity-glow': styleDef.glowColor,
      } as React.CSSProperties}
    >
      <span
        className="pca-art"
        data-case-card-art={rarity}
        aria-hidden="true"
        style={{ backgroundImage: `url(/images/web-polish-r2/cases-${rarity}.webp)` }}
      />
      <span className="cs-cardPrize" data-size={prize >= 1000 ? 'md' : 'lg'} data-dense-amount={prize >= 100}>
        {formatMoney(prize)}
      </span>
      <span className="cs-cardMult">{formatMult(multiplier)}</span>
      <span className="cs-cardRarity">{rarityLabel}</span>
    </div>
  );
}
