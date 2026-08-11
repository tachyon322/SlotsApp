'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Coins,
  Loader2,
  ShieldAlert,
  Trophy,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  adminApi,
  type AdminAnalyticsResponse,
  type AnalyticsRange,
} from '@/lib/api';

const GAME_LABELS: Record<string, string> = {
  slots: 'Слоты',
  crash: 'Crash',
  mines: 'Mines',
  cases: 'Кейсы',
  blockblast: 'BlockBlast',
  minedrop: 'MineDrop',
};

const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: 'all', label: 'Всё время' },
  { id: 'today', label: 'Сегодня' },
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
];

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return Math.round(n).toLocaleString('ru-RU');
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0 ₽';
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function fmtSign(n: number | null | undefined): string {
  const v = Math.round(n ?? 0);
  return v > 0 ? `+${v.toLocaleString('ru-RU')}` : v.toLocaleString('ru-RU');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function profitClass(profit: number | null | undefined): string {
  const v = profit ?? 0;
  return v >= 0 ? 'text-emerald-400' : 'text-red-400';
}

export default function AdminAnalyticsPage() {
  return <AdminShell>{({ token }) => <Analytics token={token} />}</AdminShell>;
}

function Analytics({ token }: { token: string }) {
  const [range, setRange] = useState<AnalyticsRange>('all');
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (t: string, r: AnalyticsRange) => {
      setLoading(true);
      setError(null);
      try {
        setData(await adminApi.analytics(t, r));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(token, range);
  }, [token, range, load]);

  const totals = data?.totals;

  return (
    <main className="px-page pt-md pb-2xl w-full">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/adminlitgame43144"
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" />
          К сводке
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-xs">
            <BarChart3 className="h-5 w-5 text-violet-400" />
            <h1 className="text-xl font-bold text-white">Аналитика игр</h1>
          </div>
          <div className="flex flex-wrap gap-1 rounded-button border border-white/10 bg-white/[0.02] p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`rounded-button px-3 py-1.5 text-xs font-semibold transition-colors ${
                  range === r.id
                    ? 'bg-violet-500 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-4 flex items-center gap-2 rounded-button border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            <ShieldAlert className="h-4 w-4" />
            {error}
          </p>
        ) : !data ? (
          <div className="mt-5 space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-panel bg-white/5" />
            ))}
          </div>
        ) : (
          <>
            {loading && (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Загрузка…
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-panel border border-white/10 bg-white/[0.02] p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-button bg-blue-500/10">
                  <Wallet className="h-4 w-4 text-blue-400" />
                </span>
                <span className="mt-3 block text-xs font-semibold text-muted-foreground">Оборот ставок</span>
                <span className="mt-0.5 block text-2xl font-bold text-white">{fmtMoney(totals?.bet)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{fmt(totals?.rounds)} раундов</span>
              </div>
              <div className="rounded-panel border border-white/10 bg-white/[0.02] p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-button bg-emerald-500/10">
                  <Coins className="h-4 w-4 text-emerald-400" />
                </span>
                <span className="mt-3 block text-xs font-semibold text-muted-foreground">Выплаты игрокам</span>
                <span className="mt-0.5 block text-2xl font-bold text-emerald-400">
                  {fmtMoney(totals?.payout)}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  RTP {totals?.rtp != null ? `${totals.rtp.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="rounded-panel border border-white/10 bg-white/[0.02] p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-button bg-red-500/10">
                  <TrendingUp className="h-4 w-4 text-red-400" />
                </span>
                <span className="mt-3 block text-xs font-semibold text-muted-foreground">
                  P&L казино
                </span>
                <span className={`mt-0.5 block text-2xl font-bold ${profitClass(totals?.profit)}`}>
                  {fmtSign(totals?.profit)} ₽
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Положительный = игроки теряют
                </span>
              </div>
              <div className="rounded-panel border border-white/10 bg-white/[0.02] p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-button bg-amber-500/10">
                  <TrendingDown className="h-4 w-4 text-amber-400" />
                </span>
                <span className="mt-3 block text-xs font-semibold text-muted-foreground">
                  Выводы (успешные)
                </span>
                <span className="mt-0.5 block text-2xl font-bold text-amber-400">
                  {fmtMoney(data.finances?.withdrawalsSum)}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {fmt(data.finances?.withdrawalsCount)} шт · депозитов{' '}
                  {fmt(data.finances?.depositsCount)}
                </span>
              </div>
            </div>

            <section className="mt-5 overflow-hidden rounded-panel border border-white/10">
              <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-3">
                <h2 className="text-sm font-bold text-white">По играм</h2>
                <span className="text-xs text-muted-foreground">
                  Прибыль = выплаты − ставки
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Игра</th>
                      <th className="px-4 py-3">Раунды</th>
                      <th className="px-4 py-3">Ставки</th>
                      <th className="px-4 py-3">Выплаты</th>
                      <th className="px-4 py-3">Прибыль</th>
                      <th className="px-4 py-3">RTP</th>
                      <th className="px-4 py-3">Винрейт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.games.map((g) => (
                      <tr
                        key={g.game}
                        className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3 font-semibold text-white">
                          {GAME_LABELS[g.game] ?? g.game}
                        </td>
                        <td className="px-4 py-3 text-white/80">{fmt(g.rounds)}</td>
                        <td className="px-4 py-3 text-white/80">{fmtMoney(g.bet)}</td>
                        <td className="px-4 py-3 text-emerald-400">{fmtMoney(g.payout)}</td>
                        <td className={`px-4 py-3 font-semibold ${profitClass(g.profit)}`}>
                          {fmtSign(g.profit)} ₽
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {g.rtp != null ? `${g.rtp.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {g.winRate != null ? `${g.winRate.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                    {data.games.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Раундов за период нет
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section className="overflow-hidden rounded-panel border border-white/10">
                <header className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
                  <Trophy className="h-4 w-4 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white">Топ выигравших</h2>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                        <th className="px-4 py-2.5">Игрок</th>
                        <th className="px-4 py-2.5">Прибыль</th>
                        <th className="px-4 py-2.5">Раунды</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topWinners.map((u, i) => (
                        <tr key={u.email} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-2.5">
                            <div className="text-white">
                              <span className="mr-1 text-xs text-white/40">{i + 1}.</span>
                              {u.name}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-emerald-400">
                            +{fmt(u.profit)} ₽
                          </td>
                          <td className="px-4 py-2.5 text-white/60">{fmt(u.rounds)}</td>
                        </tr>
                      ))}
                      {data.topWinners.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            Нет данных
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="overflow-hidden rounded-panel border border-white/10">
                <header className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
                  <Trophy className="h-4 w-4 text-red-400" />
                  <h2 className="text-sm font-bold text-white">Топ проигравших</h2>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                        <th className="px-4 py-2.5">Игрок</th>
                        <th className="px-4 py-2.5">Убыток</th>
                        <th className="px-4 py-2.5">Раунды</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topLosers.map((u, i) => (
                        <tr key={u.email} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-2.5">
                            <div className="text-white">
                              <span className="mr-1 text-xs text-white/40">{i + 1}.</span>
                              {u.name}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-red-400">
                            {fmt(u.profit)} ₽
                          </td>
                          <td className="px-4 py-2.5 text-white/60">{fmt(u.rounds)}</td>
                        </tr>
                      ))}
                      {data.topLosers.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            Нет данных
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <section className="mt-5 overflow-hidden rounded-panel border border-white/10">
              <header className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
                <Coins className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white">Крупнейшие выплаты</h2>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Игрок</th>
                      <th className="px-4 py-3">Игра</th>
                      <th className="px-4 py-3">Ставка</th>
                      <th className="px-4 py-3">Множитель</th>
                      <th className="px-4 py-3">Выплата</th>
                      <th className="px-4 py-3">Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.biggestPayouts.map((p) => (
                      <tr
                        key={`${p.createdAt}-${p.name}`}
                        className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3 text-white">{p.name}</td>
                        <td className="px-4 py-3 text-white/80">
                          {GAME_LABELS[p.game] ?? p.game}
                        </td>
                        <td className="px-4 py-3 text-white/80">{fmtMoney(p.bet)}</td>
                        <td className="px-4 py-3 text-white/80">
                          {Number.isFinite(p.multiplier) ? `${p.multiplier.toFixed(2)}×` : '—'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-400">
                          {fmtMoney(p.payout)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
                      </tr>
                    ))}
                    {data.biggestPayouts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Нет данных
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
