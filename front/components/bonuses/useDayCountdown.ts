'use client';

import { useEffect, useState } from 'react';

// Бонусный день на бэке меняется в полночь UTC (todayDate = toISOString().slice(0, 10)),
// поэтому и ежедневный бонус, и задания дня обновляются по UTC, а не по местному времени.
function secondsToUtcMidnight(now: number): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((next.getTime() - now) / 1000));
}

function formatHMS(total: number): string {
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

/** «ЧЧ:ММ:СС» до обновления бонусного дня; до гидрации — пустая строка. */
export function useDayCountdown(): string {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return now === null ? '' : formatHMS(secondsToUtcMidnight(now));
}
