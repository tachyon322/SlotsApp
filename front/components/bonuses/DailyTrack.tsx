'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, CircleHelp, Clock, Flame } from 'lucide-react';
import type { BonusesStatusResponse } from '@/lib/api';
import { formatRub, pluralRu } from '@/lib/format';
import { DAY_ART } from './art';
import { useDayCountdown } from './useDayCountdown';

// Цикл наград как на бэке (DAILY_REWARDS): показываем гостю, пока статус не загружен
const GUEST_CYCLE = [100, 150, 200, 300, 500, 750, 1000];

type DayState = 'claimed' | 'today' | 'next' | 'future';

interface DailyTrackProps {
  daily: BonusesStatusResponse['daily'] | null;
  /** Забрать бонус; возвращает зачисленную сумму или null при ошибке */
  onClaim: () => Promise<number | null>;
  onLogin: () => void;
}

// Ежедневный бонус прямо на странице: дорожка из 7 дней и кнопка получения.
// streak на бэке — число подряд забранных дней, включая сегодня, если уже забрано.
export function DailyTrack({ daily, onClaim, onLogin }: DailyTrackProps) {
  const countdown = useDayCountdown();
  // Индекс открываемого дня: пока идёт запрос и анимация, держим его «сегодняшним»,
  // даже если статус уже успел обновиться
  const [opening, setOpening] = useState<number | null>(null);
  const [pop, setPop] = useState<{ index: number; amount: number } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guest = daily === null;
  const cycle = daily && daily.cycle.length > 0 ? daily.cycle : GUEST_CYCLE;
  const len = cycle.length;
  const streak = daily?.streak ?? 0;
  const claimedToday = daily?.claimedToday ?? false;

  // Сколько дней текущего цикла уже забрано и какой день открыт сегодня
  const done = claimedToday ? ((Math.max(1, streak) - 1) % len) + 1 : streak % len;
  const todayIndex = claimedToday ? -1 : done;
  const nextIndex = claimedToday && done < len ? done : -1;
  const todayAmount = cycle[claimedToday ? 0 : done] ?? 0;
  const focusIndex = claimedToday ? nextIndex : todayIndex;

  const stateOf = (i: number): DayState => {
    if (i === opening) return 'today';
    if (i < done) return 'claimed';
    if (i === todayIndex) return 'today';
    if (i === nextIndex && opening === null) return 'next';
    return 'future';
  };

  // На телефоне дорожка листается: держим текущий день по центру
  useEffect(() => {
    const track = trackRef.current;
    if (!track || focusIndex < 0 || track.scrollWidth <= track.clientWidth) return;
    const cell = track.children[focusIndex] as HTMLElement | undefined;
    if (cell) track.scrollLeft = cell.offsetLeft - track.clientWidth / 2 + cell.clientWidth / 2;
  }, [focusIndex]);

  useEffect(() => () => {
    if (popTimer.current) clearTimeout(popTimer.current);
  }, []);

  const claim = async () => {
    if (opening !== null) return;
    const index = todayIndex;
    setOpening(index);
    // минимальная длительность — чтобы анимация открытия успела сыграть
    const [reward] = await Promise.all([onClaim(), new Promise((r) => setTimeout(r, 650))]);
    setOpening(null);
    if (reward === null) return;
    setPop({ index, amount: reward });
    if (popTimer.current) clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => setPop(null), 1200);
  };

  const title = guest ? 'Награда каждый день' : claimedToday && opening === null ? 'Сегодня забрано' : 'Награда дня ждёт';

  return (
    <section className="lb-daily" aria-labelledby="lb-daily-title">
      <header className="lb-daily-head">
        <div>
          <span className="pg-eyebrow">Ежедневный бонус</span>
          <h2 id="lb-daily-title">{title}</h2>
        </div>
        <span className="lb-streak" aria-label={`Серия: ${streak} ${pluralRu(streak, ['день', 'дня', 'дней'])}`}>
          <Flame aria-hidden="true" />
          <b>{streak}</b>
          {pluralRu(streak, ['день', 'дня', 'дней'])}
        </span>
      </header>

      <div className="lb-track" ref={trackRef} role="list" aria-label="Награды недели">
        {cycle.map((amount, i) => {
          const state = stateOf(i);
          const label =
            i === len - 1 ? 'Джекпот' : state === 'today' ? 'Сегодня' : state === 'next' ? 'Завтра' : `День ${i + 1}`;
          return (
            <div
              key={i}
              role="listitem"
              className="lb-day"
              data-state={state}
              data-final={i === len - 1}
              data-opening={i === opening}
            >
              {state === 'claimed' && (
                <span className="lb-day-ok" aria-label="Получено">
                  <Check aria-hidden="true" />
                </span>
              )}
              <span className="lb-day-n">{label}</span>
              <Image className="lb-day-art" src={DAY_ART[i] ?? DAY_ART[0]} width={120} height={120} sizes="60px" alt="" aria-hidden="true" />
              <span className="lb-day-sum">{formatRub(amount)}</span>
              {pop?.index === i && <span className="lb-pop">+{formatRub(pop.amount)}</span>}
            </div>
          );
        })}
      </div>

      <div className="lb-daily-foot">
        {guest ? (
          <button type="button" className="pg-btn pg-btn-acc lb-daily-cta" onClick={onLogin}>
            Войти и забрать {formatRub(cycle[0])}
          </button>
        ) : opening !== null ? (
          <button type="button" className="pg-btn pg-btn-acc lb-daily-cta" disabled>
            <span className="pg-spin" aria-hidden="true" />
            Открываем
          </button>
        ) : claimedToday ? (
          <button type="button" className="pg-btn pg-btn-wait lb-daily-cta" disabled>
            <Clock aria-hidden="true" />
            Следующий через <span className="lb-timer">{countdown}</span>
          </button>
        ) : (
          <button type="button" className="pg-btn pg-btn-acc lb-daily-cta" onClick={() => void claim()}>
            Забрать {formatRub(todayAmount)}
          </button>
        )}
        <button
          type="button"
          className="lb-rules-btn"
          aria-expanded={rulesOpen}
          aria-controls="lb-rules"
          onClick={() => setRulesOpen((v) => !v)}
        >
          <CircleHelp aria-hidden="true" />
          Как работает серия
        </button>
      </div>

      {rulesOpen && (
        <ol className="lb-rules" id="lb-rules">
          <li>
            <b>Заходите каждый день</b>
            Каждый день серии открывает следующую награду недели.
          </li>
          <li>
            <b>Пропуск сжигает серию</b>
            Не забрали до обновления дня — серия начнётся заново.
          </li>
          <li>
            <b>{len}-й день — джекпот</b>
            После него цикл повторяется, а серия растёт дальше.
          </li>
        </ol>
      )}
    </section>
  );
}
