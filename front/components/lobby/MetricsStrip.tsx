'use client';

import Image from 'next/image';
import { Activity, Users, Trophy } from 'lucide-react';
import { useDrift, formatMultiplier, formatRu } from './useOnline';
import { EventMetric } from './EventMetric';

export function MetricsStrip() {
  const online = useDrift(4989, 4300, 5800, 3500);
  const bigWin = useDrift(6438, 1200, 18000, 5000);
  const bigWinAmount = Math.round(bigWin * 20.3) * 100;

  return (
    <section className="ref-metrics" aria-label="Состояние арены">
      <article className="ref-metric" data-metric="pulse" data-tone="cyan">
        <span className="ref-metricIcon" aria-hidden="true">
          <Activity strokeWidth={2} />
        </span>
        <span className="ref-metricCopy">
          <span className="ref-metricLabel">Активность</span>
          <strong className="ref-metricValue">Высокая</strong>
          <span className="ref-metricDetail">Стабильная</span>
        </span>
        <span className="ref-sparkline" aria-hidden="true" />
      </article>

      <article className="ref-metric" data-metric="online" data-tone="green">
        <span className="ref-metricIcon" aria-hidden="true">
          <Users strokeWidth={2} />
        </span>
        <span className="ref-metricCopy">
          <span className="ref-metricLabel">Игроков онлайн</span>
          <strong className="ref-metricValue">{formatRu(online)}</strong>
          <span className="ref-metricDetail">+2 104 сегодня</span>
        </span>
      </article>

      <article className="ref-metric" data-metric="win" data-tone="gold">
        <span className="ref-metricIcon" aria-hidden="true">
          <Trophy strokeWidth={2} />
        </span>
        <span className="ref-metricCopy ref-metricCopyWithArt">
          <span className="ref-metricLabel">Крупный выигрыш</span>
          <strong className="ref-metricValue">{formatMultiplier(bigWin)}</strong>
          <span className="ref-metricDetail">{formatRu(bigWinAmount)} ₽</span>
        </span>
        <span className="ref-metricArt" aria-hidden="true">
          <Image
            width={128}
            height={128}
            alt=""
            src="/newVisual/arena-trophy-object-128w.webp"
          />
        </span>
      </article>

      <EventMetric />
    </section>
  );
}
