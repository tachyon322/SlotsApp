'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { useContestModal } from '@/components/ContestModal';
import {
  CONTEST_DEADLINE,
  formatContestDate,
  formatCountdown,
  getCountdownParts,
} from '@/lib/contest';

export function PulseContest() {
  const { openContest } = useContestModal();
  // null до маунта — чтобы SSR и первый клиентский рендер совпали
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const finished = now != null && now.getTime() >= CONTEST_DEADLINE.getTime();
  const detail = finished
    ? 'Идёт сейчас'
    : now
      ? `До итогов ${formatCountdown(getCountdownParts(now))}`
      : `До ${formatContestDate()}`;

  return (
    <button
      type="button"
      aria-label="Открыть конкурс"
      onClick={openContest}
      className="ref-pulseSegment"
      data-segment="event"
    >
      <span className="ref-pulseGlyph" aria-hidden="true">
        <Gift strokeWidth={2} />
      </span>
      <span className="ref-pulseCopy ref-pulseEventCopy">
        <span className="ref-pulseLabel">Текущее событие</span>
        <strong className="ref-pulseNumber">Конкурс недели</strong>
        <span className="ref-pulseDetail" suppressHydrationWarning>
          {detail}
        </span>
      </span>
      <span className="ref-pulseEventArt" aria-hidden="true">
        <Image
          width={128}
          height={128}
          alt=""
          src="/newVisual/weekend-rush-gift-object-128w.webp"
        />
      </span>
    </button>
  );
}
