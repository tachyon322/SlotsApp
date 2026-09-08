'use client';

import { useEffect, useState } from 'react';
import { Activity, Trophy } from 'lucide-react';
import { useDrift, formatMultiplier, formatRu } from './useOnline';
import { PulseContest } from './PulseContest';

export function PulseStrip() {
  const bigWin = useDrift(6438, 1200, 18000, 5000);
  const bigWinAmount = Math.round(bigWin * 20.3) * 100;
  const [agoSeconds, setAgoSeconds] = useState(19);

  useEffect(() => {
    const id = window.setInterval(() => {
      setAgoSeconds((current) => current + 5);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="ref-pulse" aria-label="Активность и события">
      <div className="ref-pulseSegment" data-segment="pulse">
        <span className="ref-pulseGlyph" aria-hidden="true">
          <Activity strokeWidth={2} />
        </span>
        <span className="ref-pulseCopy">
          <span className="ref-pulseLabel">Активность</span>
          <strong className="ref-pulseNumber">Высокая</strong>
          <span className="ref-pulseDetail">Стабильная</span>
        </span>
        <span className="ref-pulseChart" aria-hidden="true" />
      </div>

      <div className="ref-pulseSegment" data-segment="win">
        <span className="ref-pulseGlyph" aria-hidden="true">
          <Trophy strokeWidth={2} />
        </span>
        <span className="ref-pulseCopy">
          <span className="ref-pulseLabel">Последний крупный выигрыш</span>
          <strong className="ref-pulseNumber">{formatMultiplier(bigWin)}</strong>
          <span className="ref-pulseDetail">Юрий В. · Mines</span>
          <span className="ref-pulseWinMeta">
            <span>{formatRu(bigWinAmount)} ₽</span>
            <span>{agoSeconds} сек назад</span>
          </span>
        </span>
      </div>

      <PulseContest />
    </section>
  );
}
