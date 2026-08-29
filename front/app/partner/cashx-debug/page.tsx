'use client';

import { useEffect, useState } from 'react';
import { partnerApi, cashxApi } from '@/lib/api';

type Stats = { summary?: unknown; daily?: unknown };

export default function CashxDebugPage() {
  const [kazikStats, setKazikStats] = useState<Stats | null>(null);
  const [cashxStats, setCashxStats] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = process.env.NEXT_PUBLIC_CASHX_ENABLED === 'true';

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      try {
        const token = document.cookie.match(/partner_token=([^;]+)/)?.[1] || localStorage.getItem('partner_token') || '';
        if (!token) { setError('No partner token'); return; }
        const [k, c] = await Promise.all([
          partnerApi.stats(token).catch((e) => { throw new Error('kazik stats failed: ' + String(e)); }),
          cashxApi.stats(token).catch((e) => { throw new Error('cashx stats failed: ' + String(e)); }),
        ]);
        setKazikStats(k as Stats);
        setCashxStats(c);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [enabled]);

  if (!enabled) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">CashX Debug — disabled</h1>
        <p className="text-sm text-muted-foreground mt-2">Set NEXT_PUBLIC_CASHX_ENABLED=true to enable comparison view.</p>
        <p className="text-xs mt-4">This page is dev-only. It proxies GET /api/affiliate/cashx/stats vs GET /api/affiliate/stats.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">CashX Mirror Debug</h1>
      <p className="text-sm text-muted-foreground">Compare kazik (source of truth) vs CashX mirror (project kazik). Promo sources are skipped in CashX.</p>
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Kazik /api/affiliate/stats</h2>
          <pre className="text-xs overflow-auto max-h-96 mt-2">{kazikStats ? JSON.stringify(kazikStats, null, 2) : 'loading...'}</pre>
        </div>
        <div className="border rounded p-4">
          <h2 className="font-semibold">CashX /api/affiliate/cashx/stats (proxy)</h2>
          <pre className="text-xs overflow-auto max-h-96 mt-2">{cashxStats ? JSON.stringify(cashxStats, null, 2) : 'loading...'}</pre>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        <p>Income drift expected for promo sources (CashX skips type=promo). Use this to verify dual-write: click → attribution → commission → withdrawal.</p>
      </div>
    </div>
  );
}
