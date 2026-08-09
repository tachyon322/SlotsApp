'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Banknote,
  CalendarDays,
  Coins,
  Loader2,
  ChevronRight,
  Save,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { adminApi, type AdminStatsResponse, type AdminConfigResponse } from '@/lib/api';

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function StatCard({
  href,
  icon,
  label,
  value,
  sub,
  accent,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: React.ReactNode;
  accent: string;
}) {
  const content = (
    <div className="flex items-center justify-between gap-2">
      <span className={`flex h-8 w-8 items-center justify-center rounded-button ${accent}`}>
        {icon}
      </span>
      {href && <ChevronRight className="h-4 w-4 text-white/30" />}
    </div>
  );

  return (
    <div className="rounded-panel border border-white/10 bg-white/[0.02] p-4">
      {href ? (
        <Link href={href} className="block transition-colors hover:bg-white/[0.02]">
          {content}
          <span className="mt-3 block text-xs font-semibold text-muted-foreground">{label}</span>
          <span className="mt-0.5 block text-2xl font-bold text-white">{value}</span>
          {sub && <span className="mt-1 block text-xs text-muted-foreground">{sub}</span>}
        </Link>
      ) : (
        <>
          {content}
          <span className="mt-3 block text-xs font-semibold text-muted-foreground">{label}</span>
          <span className="mt-0.5 block text-2xl font-bold text-white">{value}</span>
          {sub && <span className="mt-1 block text-xs text-muted-foreground">{sub}</span>}
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminShell>{({ token }) => <Dashboard token={token} />}</AdminShell>
  );
}

function Dashboard({ token }: { token: string }) {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [config, setConfig] = useState<AdminConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bonusInput, setBonusInput] = useState('');
  const [depositInput, setDepositInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadData = useCallback(async (t: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, c] = await Promise.all([adminApi.stats(t), adminApi.getConfig(t)]);
      setStats(s);
      setConfig(c);
      setBonusInput(String(c.welcomeBonus));
      setDepositInput(String(c.minDeposit));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(token);
  }, [token, loadData]);

  const handleSaveConfig = async () => {
    const welcomeBonus = Math.floor(Number(bonusInput));
    const minDeposit = Math.floor(Number(depositInput));
    if (!Number.isFinite(welcomeBonus) || welcomeBonus < 0) {
      setSaveMessage({ ok: false, text: 'Некорректный приветственный бонус' });
      return;
    }
    if (!Number.isFinite(minDeposit) || minDeposit < 0) {
      setSaveMessage({ ok: false, text: 'Некорректная минимальная сумма депозита' });
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await adminApi.updateConfig(token, { welcomeBonus, minDeposit });
      setConfig({ welcomeBonus: res.welcomeBonus, minDeposit: res.minDeposit });
      setBonusInput(String(res.welcomeBonus));
      setDepositInput(String(res.minDeposit));
      setSaveMessage({ ok: true, text: 'Настройки сохранены' });
    } catch (err) {
      setSaveMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !stats || !config) {
    return (
      <main className="px-page pt-md pb-2xl w-full">
        <div className="mx-auto max-w-5xl space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-panel bg-white/5" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="px-page pt-md pb-2xl w-full">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-xs">
          <Users className="h-5 w-5 text-blue-400" />
          <h1 className="text-xl font-bold text-white">Сводка</h1>
        </div>

        {loadError && (
          <p className="mt-4 rounded-button border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            {loadError}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <StatCard
            href="./users"
            icon={<Users className="h-4 w-4 text-blue-400" />}
            label="Пользователи"
            value={stats.users.total.toLocaleString('ru-RU')}
            sub={`${stats.users.today} сегодня`}
            accent="bg-blue-500/10"
          />
          <StatCard
            href="./deposits"
            icon={<Banknote className="h-4 w-4 text-emerald-400" />}
            label="Депозиты"
            value={stats.deposits.total.toLocaleString('ru-RU')}
            sub={`Сумма: ${formatRub(stats.deposits.sum)}`}
            accent="bg-emerald-500/10"
          />
          <StatCard
            icon={<CalendarDays className="h-4 w-4 text-amber-400" />}
            label="Депозиты сегодня"
            value={stats.deposits.today.toLocaleString('ru-RU')}
            sub={`Сумма: ${formatRub(stats.deposits.todaySum)}`}
            accent="bg-amber-500/10"
          />
          <StatCard
            icon={<Coins className="h-4 w-4 text-violet-400" />}
            label="Приветственный бонус"
            value={formatRub(config.welcomeBonus)}
            sub="Быстрый вход (quick-auth)"
            accent="bg-violet-500/10"
          />
        </div>

        <section className="mt-5 rounded-panel border border-white/10 bg-white/[0.02] p-4">
          <header className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-violet-400" />
            <h2 className="text-base font-bold text-white">Настройки</h2>
          </header>
          <p className="mt-1 text-xs text-muted-foreground">
            Финансовые параметры площадки
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/80">
                Приветственный бонус
              </label>
              <label className="flex items-center gap-3 rounded-button border border-white/15 bg-white/5 px-4 py-2.5">
                <span className="text-sm font-bold text-violet-400">₽</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={bonusInput}
                  onChange={(e) => setBonusInput(e.target.value)}
                  placeholder="8888"
                  className="w-full bg-transparent text-sm font-semibold text-white placeholder:text-white/30 focus:outline-none"
                />
              </label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Зачисляется новым пользователям при быстром входе (quick-auth)
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/80">
                Минимальная сумма депозита
              </label>
              <label className="flex items-center gap-3 rounded-button border border-white/15 bg-white/5 px-4 py-2.5">
                <span className="text-sm font-bold text-emerald-400">₽</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={depositInput}
                  onChange={(e) => setDepositInput(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-sm font-semibold text-white placeholder:text-white/30 focus:outline-none"
                />
              </label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Минимум при пополнении баланса в модалке пополнения
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1 rounded-button bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:from-violet-600 hover:to-purple-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" />
              Сохранить
            </button>
          </div>

          {saveMessage && (
            <p
              className={`mt-3 text-xs ${
                saveMessage.ok ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {saveMessage.text}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
