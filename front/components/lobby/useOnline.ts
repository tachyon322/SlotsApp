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
        // шаг пропорционален диапазону, чтобы и онлайн, и множитель (в сотых) дрейфовали заметно
        const step = Math.max(6, Math.round((max - min) * (0.004 + Math.random() * 0.012)));
        const next = current + direction.current * step;
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
