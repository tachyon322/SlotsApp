'use client';

import { useDrift, formatMultiplier, formatRu } from './lobby/useOnline';

// Живые счётчики подвала (демо-дрейф, как в макете)
export function FooterStat({ kind }: { kind: 'online' | 'bigwin' }) {
  const online = useDrift(4989, 4300, 5800, 3500);
  const bigWin = useDrift(6438, 1200, 18000, 5000);

  return <b className="lg-num">{kind === 'online' ? formatRu(online) : formatMultiplier(bigWin)}</b>;
}
