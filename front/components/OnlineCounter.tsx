"use client";

import { useEffect, useRef, useState } from "react";

interface OnlineCounterProps {
  initial: number;
  min: number;
  max: number;
}

function formatOnline(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(2)}K` : value.toString();
}

export function OnlineCounter({ initial, min, max }: OnlineCounterProps) {
  const [online, setOnline] = useState(initial);
  const direction = useRef(1);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setOnline((current) => {
        if (Math.random() < 0.15) {
          direction.current *= -1;
        }

        const change = Math.floor(Math.random() * 28) + 8;
        const next = current + direction.current * change;

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
    }, 2000);

    return () => window.clearInterval(interval);
  }, [max, min]);

  return <>{formatOnline(online)}</>;
}
