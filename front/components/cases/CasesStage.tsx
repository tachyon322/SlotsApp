'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RARITY_STYLES, type CaseRarity } from '@/lib/cases/engine';
import type { CaseLineResult } from '@/lib/api';
import { IDLE_CARDS, IDLE_CENTER, formatMoney, formatMult } from '@/components/cases/drops';
import { rarityArt } from '@/components/cases/CasesPicker';
import { pluralRu } from '@/lib/format';

interface CasesStageProps {
  lines: number;
  spinning: boolean;
  spinId: number;
  settled: boolean;
  settledLines: boolean[];
  linesData: CaseLineResult[];
  lineBet: number;
  bigWin: boolean;
  lastPayout: number;
  lastMultiplier: number;
  outcome: 'win' | 'loss' | 'neutral' | null;
  maxRarity: CaseRarity | null;
}

// Длительности прокрутки линий — те же, что паузы до остановки в useCasesGame (2500 / 3150 / 3800 мс).
const DURATIONS = [2500, 3150, 3800];

/** Сумма на карточке: до 10 000 — целыми рублями, дальше — «12,5K ₽». */
function cardMoney(n: number): string {
  if (n >= 10_000) {
    const k = n / 1000;
    return `${k.toLocaleString('ru-RU', { maximumFractionDigits: k >= 100 ? 0 : 1 })}K ₽`;
  }
  if (n >= 100) return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  return formatMoney(n);
}

type Motion = 'wait' | 'arming' | 'run';

export function CasesStage({
  lines,
  spinning,
  spinId,
  settled,
  settledLines,
  linesData,
  lineBet,
  bigWin,
  lastPayout,
  lastMultiplier,
  outcome,
  maxRarity,
}: CasesStageProps) {
  // Шаг карточки = ширина трека / --kc-visible (CSS), меряем по факту — победная карта
  // должна встать точно под маркер на любой ширине.
  const reelRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ step: 114, trackWidth: 342 });

  useEffect(() => {
    const reel = reelRef.current;
    const track = reel?.querySelector<HTMLElement>('.kc-track');
    if (!reel || !track) return;
    const measure = () => {
      const trackWidth = track.getBoundingClientRect().width;
      if (!Number.isFinite(trackWidth) || trackWidth <= 0) return;
      const visible = parseFloat(getComputedStyle(reel).getPropertyValue('--kc-visible')) || 3;
      const step = trackWidth / visible;
      setMetrics((prev) => (prev.step === step && prev.trackWidth === trackWidth ? prev : { step, trackWidth }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [lines]);

  // Прокрутка стартует, когда пришла НОВАЯ лента (ответ сервера), а не по нажатию:
  // тогда остановка совпадает с паузами хука и звуком «приземления».
  // wait — ждём ответ (старая лента стоит), arming — новая лента за правым краем, run — едет.
  const spinningRef = useRef(spinning);
  useEffect(() => {
    spinningRef.current = spinning;
  });
  const [motion, setMotion] = useState<Motion>('wait');
  useEffect(() => {
    setMotion('wait');
  }, [spinId]);
  useEffect(() => {
    if (!spinningRef.current || linesData.length === 0) return;
    setMotion('arming');
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setMotion('run'));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [linesData]);

  const resetOffset = Math.max(600, metrics.trackWidth / 2 + metrics.step);
  const waiting = spinning && motion === 'wait';
  const net = lastPayout - lineBet * lines;

  return (
    <section className="kc-stage" data-bigwin={bigWin} data-lines={lines} aria-label="Призовая рулетка">
      <div
        ref={reelRef}
        className="kc-reel"
        data-lines={lines}
        data-busy={spinning}
        role="img"
        aria-label={`Призовая лента, ${lines} ${pluralRu(lines, ['линия', 'линии', 'линий'])}`}
      >
        {Array.from({ length: lines }, (_, lineIdx) => {
          const line = linesData[lineIdx];
          const lineSettled = settledLines[lineIdx] ?? true;
          const idle = !line;

          let transform: string;
          let transition = 'none';
          if (idle) {
            transform = `translate(-${IDLE_CENTER * metrics.step + metrics.step / 2}px, -50%)`;
          } else {
            const target = `translate(-${line.winnerIndex * metrics.step + metrics.step / 2}px, -50%)`;
            if (!spinning || waiting) {
              transform = target;
            } else if (motion === 'arming') {
              transform = `translate(${resetOffset}px, -50%)`;
            } else {
              transform = target;
              transition = `transform ${DURATIONS[lineIdx] ?? 2500 + lineIdx * 650}ms cubic-bezier(0.16, 1, 0.3, 1)`;
            }
          }

          return (
            <div
              key={lineIdx}
              className="kc-track"
              data-settled={lineSettled}
              data-wait={waiting || undefined}
              data-idle={idle || undefined}
            >
              <div className="kc-strip" style={{ transform, transition }}>
                {idle
                  ? IDLE_CARDS.map((d, i) => (
                      <PrizeCard
                        key={i}
                        rarity={d.rarity}
                        prize={Number((lineBet * d.multiplier).toFixed(2))}
                        multiplier={d.multiplier}
                        featured={i === IDLE_CENTER}
                      />
                    ))
                  : line.strip.map((card, i) => (
                      <PrizeCard
                        key={i}
                        rarity={card.rarity}
                        prize={card.prize}
                        multiplier={card.multiplier}
                        winner={lineSettled && !waiting && i === line.winnerIndex}
                      />
                    ))}
              </div>
              {lines > 1 && <span className="kc-trackNo">{lineIdx + 1}</span>}
            </div>
          );
        })}
      </div>

      <div className="kc-res" data-tone={settled && outcome ? outcome : 'idle'} aria-live="polite">
        {settled && outcome ? (
          <>
            <div className="kc-resMain">
              <small>
                {bigWin
                  ? 'Большой выигрыш'
                  : outcome === 'win'
                    ? 'Выигрыш'
                    : outcome === 'neutral'
                      ? 'Вернулось'
                      : 'Пусто'}
                {maxRarity && (
                  <em style={{ '--r': RARITY_STYLES[maxRarity].color } as React.CSSProperties}>
                    {RARITY_STYLES[maxRarity].label}
                  </em>
                )}
              </small>
              <b>{formatMoney(lastPayout)}</b>
            </div>
            <div className="kc-resSide">
              <span>×{lastMultiplier}</span>
              <span data-tone={net > 0 ? 'pos' : 'neg'}>
                {net >= 0 ? `+${formatMoney(net)}` : `−${formatMoney(-net)}`}
              </span>
            </div>
            {lines > 1 && linesData.length === lines && (
              <ul className="kc-resLines">
                {linesData.map((l) => (
                  <li
                    key={l.lineIndex}
                    style={{ '--r': RARITY_STYLES[l.winningCard.rarity].color } as React.CSSProperties}
                  >
                    <i>{l.lineIndex + 1}</i>
                    {formatMoney(l.linePayout)}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="kc-resHint">
            {spinning
              ? `Открываем ${lines > 1 ? `${lines} ${pluralRu(lines, ['линию', 'линии', 'линий'])}` : 'кейс'}…`
              : 'Приз — карточка, которая остановится под маркером'}
          </p>
        )}
      </div>
    </section>
  );
}

function PrizeCard({
  rarity,
  prize,
  multiplier,
  winner = false,
  featured = false,
}: {
  rarity: CaseRarity;
  prize: number;
  multiplier: number;
  winner?: boolean;
  featured?: boolean;
}) {
  const style = RARITY_STYLES[rarity] || RARITY_STYLES.common;
  return (
    <div
      className="kc-card"
      data-rarity={rarity}
      data-winner={winner || undefined}
      data-featured={featured || undefined}
      style={{ '--r': style.color, '--rg': style.glowColor } as React.CSSProperties}
    >
      <div className="kc-cardIn">
        <i className="kc-art" style={{ backgroundImage: `url(${rarityArt(rarity)})` }} aria-hidden="true" />
        <b>{cardMoney(prize)}</b>
        <small>{formatMult(multiplier)}</small>
      </div>
    </div>
  );
}
