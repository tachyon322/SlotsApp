'use client';

import { useEffect, useRef, useState } from 'react';

/** Медленный дрейф числа в диапазоне [min, max] — имитация живого онлайна */
export function useDrift(initial: number, min: number, max: number, intervalMs = 3000): number {
  const [value, setValue] = useState(initial);
  const direction = useRef(1);

  useEffect(() => {
    const id = window.setInterval(() => {
      setValue((current) => {
        if (Math.random() < 0.15) {
          direction.current *= -1;
        }
        const next = current + direction.current * (Math.floor(Math.random() * 24) + 6);
        if (next <= min) {
          direction.current = 1;
          return min;
        }
        if (next >= max) {
          direction.current = -1;
          return max;
        }
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [min, max, intervalMs]);

  return value;
}

/** 6438 -> 64.38 */
export function formatMultiplier(hundredths: number): string {
  return `x${(hundredths / 100).toFixed(2)}`;
}

export function formatRu(value: number): string {
  return value.toLocaleString('ru-RU');
}

/** 1127 -> «1,1 тыс.» */
export function formatCompact(value: number): string {
  if (value >= 1000) {
    const thousands = (value / 1000).toFixed(1).replace('.', ',').replace(',0', '');
    return `${thousands} тыс.`;
  }
  return String(value);
}
