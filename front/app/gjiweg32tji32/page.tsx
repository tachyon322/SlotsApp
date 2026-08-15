'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FlaskConical,
  Database,
  Filter,
  Play,
  RefreshCw,
  RotateCcw,
  Check,
  X,
  Loader2,
  ArrowRight,
  User,
  Coins,
  ShieldCheck,
  Crown,
  FileWarning,
} from 'lucide-react';
import { walletApi, authApi, devtoolsApi, ApiError } from '@/lib/api';
import type { WithdrawRequestCode } from '@/lib/api';
import type { DevtoolsFunnelStatusResponse, QuickAuthResponse } from '@/lib/api';
import { LogConsole, type LogEntry, type LogLevel } from '@/components/test/LogConsole';

type StepId =
  | 'auth'
  | 'eligibility'
  | 'withdraw-1'
  | 'deposit'
  | 'withdraw-2'
  | 'verify'
  | 'withdraw-3'
  | 'premium'
  | 'active'
  | 'requests'
  | 'reset';

type StepStatus = 'idle' | 'running' | 'done' | 'failed';

const STEP_DEFS: { id: StepId; title: string; description: string; expected: string }[] = [
  {
    id: 'auth',
    title: '1. Авторизация',
    description: 'Создание реального тестового пользователя через quick-auth.',
    expected: 'Новая сессия, welcome-бонус на балансе.',
  },
  {
    id: 'eligibility',
    title: '2. Состояние гейтов',
    description: 'GET /api/wallet/withdraw/eligibility — смотрим воронку снаружи.',
    expected: 'Все гейты вывода закрыты (false).',
  },
  {
    id: 'withdraw-1',
    title: '3. Вывод #1 — без депозита',
    description: 'Попытка вывести 10 000 ₽. Ожидаем отказ на гейте депозита.',
    expected: '403 need_deposit + заявка-отказ записана в БД.',
  },
  {
    id: 'deposit',
    title: '4. Депозит (реальный)',
    description: 'Симуляция оплаты депозита 20 000 ₽: payment PAID + транзакции deposit и бонус 100%.',
    expected: 'Баланс +40 000 ₽, транзакции в БД.',
  },
  {
    id: 'withdraw-2',
    title: '5. Вывод #2 — после депозита',
    description: 'Гейт депозита пройден, следующий — верификация реквизитов.',
    expected: '403 need_verification.',
  },
  {
    id: 'verify',
    title: '6. Верификация (реальная)',
    description: 'Оплата верификации реквизитов 2 000 ₽: payment purpose=verification PAID.',
    expected: 'hasPaidVerification = true.',
  },
  {
    id: 'withdraw-3',
    title: '7. Вывод #3 — после верификации',
    description: 'Верификация оплачена — гейты пройдены, Премиум больше не обязателен.',
    expected: 'success, pending-заявка в БД, деньги списаны.',
  },
  {
    id: 'premium',
    title: '8. Премиум (реальный, опциональный)',
    description: 'Покупка Премиума 2 000 ₽: payment purpose=premium PAID + premiumUntil = 2099.',
    expected: 'premiumActive = true.',
  },
  {
    id: 'active',
    title: '9. Активная заявка',
    description: 'GET /api/wallet/withdraw/active — заявка на главной.',
    expected: 'request есть, premiumActive = true → приоритет до 12 часов.',
  },
  {
    id: 'requests',
    title: '10. Заявки на вывод',
    description: 'GET /api/wallet/withdraw/requests + список выводов из БД.',
    expected: 'Отказов нет, виден pending-вывод.',
  },
  {
    id: 'reset',
    title: '11. Сброс воронки',
    description: 'Удаляет payments и транзакции вывода/депозита, сбрасывает гейты.',
    expected: 'Воронка снова чистая, можно пройти заново.',
  },
];

const WITHDRAW_EXPECT: Partial<Record<StepId, WithdrawRequestCode | 'success'>> = {
  'withdraw-1': 'need_deposit',
  'withdraw-2': 'need_verification',
  'withdraw-3': 'success',
};

const WITHDRAW_AMOUNT = 10000;
const CARD_NUMBER = '4111 1111 1111 1111';

const STATUS_BADGE: Record<StepStatus, { label: string; className: string }> = {
  idle: { label: 'Ожидание', className: 'bg-zinc-800 text-zinc-400' },
  running: { label: 'Выполняется…', className: 'bg-blue-500/20 text-blue-300 animate-pulse' },
  done: { label: 'Готово', className: 'bg-emerald-500/20 text-emerald-300' },
  failed: { label: 'Ошибка', className: 'bg-red-500/20 text-red-300' },
};

const GATE_LABELS: Record<keyof DevtoolsFunnelStatusResponse['gates'], string> = {
  hasDeposit: 'Депозит',
  hasPaidVerification: 'Верификация',
  premiumActive: 'Премиум',
  verifiedForPayment: 'Реквизиты подтверждены',
  premiumUntil: 'Премиум до',
};

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

export default function DevToolsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [redisStatus, setRedisStatus] = useState<'idle' | 'running' | 'ok' | 'fail'>('idle');
  const [stepStatus, setStepStatus] = useState<Record<StepId, StepStatus>>(() =>
    Object.fromEntries(STEP_DEFS.map((s) => [s.id, 'idle'])) as Record<StepId, StepStatus>,
  );
  const [funnelStatus, setFunnelStatus] = useState<DevtoolsFunnelStatusResponse | null>(null);
  const [credentials, setCredentials] = useState<QuickAuthResponse | null>(null);

  const logId = useRef(0);
  const busyRef = useRef(false);

  const pushLog = useCallback((level: LogLevel, message: string, detail?: unknown) => {
    setLogs((prev) => [
      ...prev,
      { id: ++logId.current, level, message, detail, at: new Date().toLocaleTimeString('ru-RU') },
    ]);
  }, []);

  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      pushLog('request', label);
      const t = Date.now();
      try {
        const res = await fn();
        pushLog('response', `${label} — ok`, { ms: Date.now() - t, data: res });
        return res;
      } catch (err) {
        const apiErr = err as ApiError;
        pushLog('error', `${label} — ${apiErr?.message ?? 'ошибка запроса'}`, {
          ms: Date.now() - t,
          status: apiErr?.status,
          code: apiErr?.code,
        });
        throw err;
      }
    },
    [pushLog],
  );

  const refreshFunnelStatus = useCallback(async () => {
    try {
      const res = await run('GET /api/gjiweg32tji32/funnel/status', () => devtoolsApi.funnelStatus());
      setFunnelStatus(res);
      return res;
    } catch {
      return null;
    }
  }, [run]);

  const markStep = useCallback((id: StepId, status: StepStatus) => {
    setStepStatus((prev) => ({ ...prev, [id]: status }));
  }, []);

  const handleRedisCheck = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRunning(true);
    setRedisStatus('running');
    try {
      const res = await run('GET /api/gjiweg32tji32/redis/check', () => devtoolsApi.redisCheck());
      for (const step of res.steps) {
        pushLog(step.ok ? 'success' : 'error', `Redis ${step.name}`, {
          ms: step.ms,
          detail: step.detail,
        });
      }
      pushLog(res.ok ? 'success' : 'error', `Redis: ${res.ok ? 'работает' : 'НЕ работает'}`, {
        totalMs: res.totalMs,
        redisUrl: res.redisUrl,
        error: res.error,
      });
      setRedisStatus(res.ok ? 'ok' : 'fail');
    } catch (err) {
      pushLog('error', 'Redis check — ошибка', { err });
      setRedisStatus('fail');
    } finally {
      busyRef.current = false;
      setRunning(false);
    }
  }, [pushLog, run]);

  const attemptWithdraw = useCallback(
    async (expectCode: WithdrawRequestCode | 'success') => {
      pushLog('request', `POST /api/wallet/withdraw (${WITHDRAW_AMOUNT} ₽, карта)`);
      const t = Date.now();
      try {
        const res = await walletApi.withdraw(WITHDRAW_AMOUNT, 'card', CARD_NUMBER);
        pushLog('response', `Вывод прошёл`, { ms: Date.now() - t, data: res });
        if (expectCode !== 'success') {
          pushLog('error', `Ожидали отказ ${expectCode}, но вывод прошёл успешно`, res);
          throw new Error('unexpected_withdraw_success');
        }
      } catch (err) {
        const apiErr = err as ApiError;
        if (expectCode === 'success') throw err;
        if (apiErr?.code === expectCode) {
          pushLog('success', `Вывод отклонён, как и ожидалось: ${expectCode} (HTTP ${apiErr.status})`, {
            ms: Date.now() - t,
            message: apiErr.message,
          });
        } else {
          pushLog('error', `Вывод: ожидали ${expectCode}, получили ${apiErr?.code ?? 'неизвестно'}`, {
            ms: Date.now() - t,
            status: apiErr?.status,
            message: apiErr?.message,
          });
          throw err;
        }
      }

      try {
        const reqs = await run('GET /api/wallet/withdraw/requests', () => walletApi.withdrawRequests());
        pushLog('info', 'Записанные в БД заявки-отказы', reqs.items);
      } catch (err) {
        pushLog('error', 'Не удалось получить заявки-отказы', { err });
      }
    },
    [pushLog, run],
  );

  const execStep = useCallback(
    async (id: StepId) => {
      markStep(id, 'running');
      try {
        switch (id) {
          case 'auth': {
            const res = await run('POST /api/quick-auth', () => authApi.quick());
            pushLog('success', `Создан пользователь ${res.login}`, {
              password: res.password,
              balance: res.balance,
            });
            setCredentials(res);
            await refreshFunnelStatus();
            break;
          }
          case 'eligibility': {
            const res = await run('GET /api/wallet/withdraw/eligibility', () => walletApi.eligibility());
            pushLog('info', 'Гейты вывода', res);
            await refreshFunnelStatus();
            break;
          }
          case 'withdraw-1':
          case 'withdraw-2':
          case 'withdraw-3': {
            await attemptWithdraw(WITHDRAW_EXPECT[id] ?? 'success');
            await refreshFunnelStatus();
            break;
          }
          case 'deposit': {
            const res = await run('POST /api/gjiweg32tji32/funnel/deposit (20 000 ₽)', () =>
              devtoolsApi.funnelDeposit(20000),
            );
            pushLog('success', 'Депозит зачислен', res);
            await refreshFunnelStatus();
            break;
          }
          case 'verify': {
            const res = await run('POST /api/gjiweg32tji32/funnel/verify', () => devtoolsApi.funnelVerify());
            pushLog('success', 'Верификация оплачена', res);
            await refreshFunnelStatus();
            break;
          }
          case 'premium': {
            const res = await run('POST /api/gjiweg32tji32/funnel/premium', () =>
              devtoolsApi.funnelPremium(),
            );
            pushLog('success', 'Премиум оформлен', res);
            await refreshFunnelStatus();
            break;
          }
          case 'active': {
            const res = await run('GET /api/wallet/withdraw/active', () =>
              walletApi.withdrawActive(),
            );
            if (!res.request) {
              pushLog('error', 'Активная заявка не найдена', res);
              throw new Error('no_active_request');
            }
            if (!res.premiumActive) {
              pushLog('error', 'Премиум не активен — приоритета нет', res);
              throw new Error('no_premium');
            }
            pushLog('success', 'Заявка активна и приоритетна (premiumActive)', res);
            break;
          }
          case 'requests': {
            const reqs = await run('GET /api/wallet/withdraw/requests', () => walletApi.withdrawRequests());
            pushLog('info', 'Заявки-отказы', reqs.items);
            const status = await refreshFunnelStatus();
            pushLog('info', 'Выводы из БД (devtools)', status?.withdrawals ?? []);
            break;
          }
          case 'reset': {
            const res = await run('POST /api/gjiweg32tji32/funnel/reset', () => devtoolsApi.funnelReset());
            pushLog('info', 'Воронка сброшена', res);
            await refreshFunnelStatus();
            break;
          }
        }
        markStep(id, 'done');
      } catch (err) {
        markStep(id, 'failed');
        pushLog('error', `Шаг «${id}» завершился с ошибкой`, { err });
      }
    },
    [run, pushLog, markStep, refreshFunnelStatus, attemptWithdraw],
  );

  const executeStep = useCallback(
    async (id: StepId) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setRunning(true);
      try {
        await execStep(id);
      } finally {
        busyRef.current = false;
        setRunning(false);
      }
    },
    [execStep],
  );

  const runAll = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRunning(true);
    pushLog('system', 'Запуск всего флоу воронки вывода…');
    try {
      for (const def of STEP_DEFS) {
        await execStep(def.id);
      }
      pushLog('system', 'Флоу завершён.');
    } finally {
      busyRef.current = false;
      setRunning(false);
    }
  }, [execStep, pushLog]);

  const handleFunnelRefresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRunning(true);
    try {
      await refreshFunnelStatus();
    } finally {
      busyRef.current = false;
      setRunning(false);
    }
  }, [refreshFunnelStatus]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const gates = funnelStatus?.gates;
  const balance = funnelStatus?.user.balance ?? credentials?.balance ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/60 px-md py-md sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-sm flex-wrap">
          <div className="flex items-center gap-sm">
            <span className="p-sm rounded-panel bg-blue-500/15 text-blue-400">
              <FlaskConical className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-lg font-bold">Dev Tools · тестовая страница</h1>
              <p className="text-xs text-zinc-500">
                Проверка Redis и пошаговый прогон воронки вывода средств
              </p>
            </div>
          </div>
          <div className="flex items-center gap-xs">
            <Link
              href="/"
              className="inline-flex items-center gap-xs whitespace-nowrap rounded-button text-xs font-medium transition-colors px-md py-xs h-9 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200"
            >
              На главную
            </Link>
            {running && (
              <span className="inline-flex items-center gap-2 text-xs text-blue-300">
                <Loader2 className="w-4 h-4 animate-spin" /> выполняется…
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-md py-xl">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-lg">
          <div className="lg:col-span-3 space-y-xl">
            {/* Redis */}
            <section className="rounded-card border border-zinc-800 bg-zinc-900/40 p-card">
              <div className="flex items-center gap-sm mb-sm">
                <span className="p-sm rounded-panel bg-red-500/15 text-red-400">
                  <Database className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <h2 className="text-base font-bold">Redis</h2>
                  <p className="text-xs text-zinc-500">
                    Проверка подключения: ping, set/get, версия, ttl, del
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-pill px-sm py-1 ${
                    redisStatus === 'ok'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : redisStatus === 'fail'
                      ? 'bg-red-500/15 text-red-300'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {redisStatus === 'ok' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : redisStatus === 'fail' ? (
                    <X className="w-3.5 h-3.5" />
                  ) : redisStatus === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-pill bg-zinc-600" />
                  )}
                  {redisStatus === 'ok'
                    ? 'OK'
                    : redisStatus === 'fail'
                    ? 'Ошибка'
                    : redisStatus === 'running'
                    ? '…'
                    : 'Не проверено'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRedisCheck}
                disabled={running}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-bold transition-colors px-md py-xs h-12 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white disabled:opacity-50"
              >
                {redisStatus === 'running' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Проверить Redis
              </button>
            </section>

            {/* Funnel status */}
            <section className="rounded-card border border-zinc-800 bg-zinc-900/40 p-card">
              <div className="flex items-center gap-sm mb-sm">
                <span className="p-sm rounded-panel bg-amber-500/15 text-amber-400">
                  <Coins className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <h2 className="text-base font-bold">Текущее состояние воронки</h2>
                  <p className="text-xs text-zinc-500">
                    {funnelStatus?.user
                      ? `${funnelStatus.user.name} · ${funnelStatus.user.email}`
                      : 'Авторизуйтесь или нажмите «Обновить»'}
                  </p>
                </div>
                <span className="text-sm font-bold text-money">
                  {balance !== null ? formatRub(balance) : '—'}
                </span>
                <button
                  type="button"
                  onClick={handleFunnelRefresh}
                  disabled={running}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-button text-xs font-medium transition-colors px-sm py-xs h-9 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
                  Обновить
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-xs">
                {(Object.keys(GATE_LABELS) as (keyof typeof GATE_LABELS)[])
                  .filter((key) => key !== 'premiumUntil')
                  .map((key) => {
                    const value = gates?.[key];
                    const active = value === true;
                    return (
                      <div
                        key={key}
                        className={`rounded-panel border px-sm py-sm ${
                          active ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs text-zinc-400">{GATE_LABELS[key]}</span>
                          {value === undefined ? (
                            <span className="w-2 h-2 rounded-pill bg-zinc-700" />
                          ) : active ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-red-400" />
                          )}
                        </div>
                        <p className={`text-sm font-bold mt-0.5 ${active ? 'text-emerald-300' : 'text-zinc-500'}`}>
                          {value === undefined ? '—' : active ? 'Пройден' : 'Закрыт'}
                        </p>
                      </div>
                    );
                  })}
              </div>
              {funnelStatus && funnelStatus.withdrawals.length > 0 && (
                <div className="mt-sm pt-sm border-t border-zinc-800">
                  <p className="text-xs text-zinc-500 mb-2">Последние выводы из БД:</p>
                  <div className="space-y-1">
                    {funnelStatus.withdrawals.slice(0, 5).map((w) => (
                      <div key={w.id} className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-zinc-500">{new Date(w.createdAt).toLocaleString('ru-RU')}</span>
                        <span className="text-zinc-300">{formatRub(w.amount)}</span>
                        <span
                          className={`rounded-pill px-2 py-0.5 text-[10px] font-bold ${
                            w.status === 'pending'
                              ? 'bg-amber-500/15 text-amber-300'
                              : w.status === 'failed'
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {w.status}
                        </span>
                        <span className="text-zinc-600 truncate">{w.details ?? w.method}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Funnel stepper */}
            <section className="rounded-card border border-zinc-800 bg-zinc-900/40 p-card">
              <div className="flex items-center gap-sm mb-md">
                <span className="p-sm rounded-panel bg-blue-500/15 text-blue-400">
                  <Filter className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <h2 className="text-base font-bold">Воронка вывода средств</h2>
                  <p className="text-xs text-zinc-500">
                    Реальные записи в БД: депозит, верификация, Премиум, подтверждение реквизитов
                  </p>
                </div>
              </div>

              {credentials && (
                <div className="mb-md rounded-panel border border-blue-500/20 bg-blue-500/5 px-sm py-xs text-xs text-blue-200">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span className="font-bold">{credentials.login}</span>
                    <span className="text-blue-300/60 font-mono">{credentials.password}</span>
                  </div>
                </div>
              )}

              <div className="space-y-sm">
                {STEP_DEFS.map((step) => {
                  const status = stepStatus[step.id];
                  const badge = STATUS_BADGE[status];
                  return (
                    <div
                      key={step.id}
                      className={`rounded-panel border p-sm transition-colors ${
                        status === 'done'
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : status === 'failed'
                          ? 'border-red-500/20 bg-red-500/5'
                          : 'border-zinc-800 bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-sm flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-zinc-200">{step.title}</h3>
                            <span className={`rounded-pill px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
                          <p className="text-xs text-zinc-600 mt-0.5">
                            <span className="text-zinc-500">Ожидаем:</span> {step.expected}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => executeStep(step.id)}
                          disabled={running}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-button text-xs font-bold transition-colors px-md py-xs h-9 border border-zinc-700 hover:border-blue-500 hover:text-blue-300 text-zinc-300 disabled:opacity-50"
                        >
                          {status === 'running' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : status === 'done' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          Выполнить
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-md flex flex-col sm:flex-row gap-xs">
                <button
                  type="button"
                  onClick={runAll}
                  disabled={running}
                  className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button px-md py-xs h-12 text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white disabled:opacity-50 flex-1"
                >
                  {running ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  Прогнать весь флоу
                </button>
                <button
                  type="button"
                  onClick={() => executeStep('reset')}
                  disabled={running}
                  className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button px-md py-xs h-12 text-sm font-bold border-2 border-zinc-700 hover:border-red-500 hover:text-red-300 text-zinc-300 disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Сбросить воронку
                </button>
              </div>
            </section>

            {/* Auth quick reference */}
            <section className="rounded-card border border-zinc-800 bg-zinc-900/40 p-card">
              <div className="flex items-center gap-sm">
                <span className="p-sm rounded-panel bg-emerald-500/15 text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <h2 className="text-base font-bold">Как работает воронка</h2>
                  <p className="text-xs text-zinc-500">
                    Порядок гейтов на сервере: депозит → верификация → Премиум → проверка реквизитов.
                    Каждый шаг пишет настоящие записи в БД.
                  </p>
                </div>
                <Crown className="w-5 h-5 text-amber-400/60" />
              </div>
              <div className="mt-sm flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                <FileWarning className="w-3.5 h-3.5" />
                <span>
                  Шаг «Авторизация» создаёт нового пользователя и переключает сессию на него. Прогон
                  флоу — на отдельном тестовом аккаунте, не на вашем.
                </span>
              </div>
            </section>
          </div>

          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-20">
              <LogConsole logs={logs} onClear={clearLogs} maxHeight="h-[60vh]" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
