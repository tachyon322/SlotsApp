'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FlaskConical, RefreshCw, Timer, Wallet, Check, X, Trash2, Power, ArrowRight } from 'lucide-react';

const KEY = 'kazik:site-lock';
// Тот же ключ, что у AdminShell: вошёл в админку — /devtest уже работает.
const ADMIN_TOKEN_KEY = 'admin_token';

interface Status {
  enabled: boolean;
  locked: boolean;
  lockedUntil: string | null;
  reason: string | null;
  pending: {
    id: string;
    amount: number;
    createdAt: string;
    deadline: string;
  } | null;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU');
}

async function call(path: string, init?: RequestInit): Promise<Status | { error: string; code?: string }> {
  const token = window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  const res = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as Status & { message?: string; code?: string };
  if (!res.ok) return { error: data.message || `HTTP ${res.status}`, code: data.code };
  return data;
}

export default function DevTestPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [seconds, setSeconds] = useState('10');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [flag, setFlag] = useState<string | null>(null);
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState('');

  const push = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString('ru-RU')} · ${line}`, ...prev].slice(0, 40));
  }, []);

  const load = useCallback(async () => {
    const res = await call('/api/devtest/lock/status');
    if ('error' in res) {
      if (res.code === 'admin_required') setNeedPass(true);
      push(`статус: ${res.error}`);
      return;
    }
    setNeedPass(false);
    setStatus(res);
    setFlag(window.localStorage.getItem(KEY));
  }, [push]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (path: string, body?: unknown, label?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await call(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if ('error' in res) {
        if (res.code === 'admin_required') setNeedPass(true);
        push(`${label ?? path}: ${res.error}`);
      } else {
        setStatus(res);
        // Держим localStorage в том же состоянии, что сервер: страница сама
        // не блокируется, поэтому флаг обновляем руками.
        const future = res.lockedUntil ? new Date(res.lockedUntil).getTime() > Date.now() : false;
        if (res.locked) window.localStorage.setItem(KEY, '1');
        else if (!future) window.localStorage.removeItem(KEY);
        push(`${label ?? path}: ок`);
      }
    } finally {
      setBusy(false);
      setFlag(window.localStorage.getItem(KEY));
    }
  };

  const savePass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass.trim()) return;
    window.localStorage.setItem(ADMIN_TOKEN_KEY, pass.trim());
    setPass('');
    void load();
  };

  const clearFlag = () => {
    window.localStorage.removeItem(KEY);
    setFlag(null);
    push('флаг localStorage снят (страница не перезагружена)');
  };

  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-[42rem]">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-300">
            <FlaskConical className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold">Тест блокировки сайта</h1>
            <p className="text-xs text-white/50">
              Работает на текущем аккаунте. Роут и его API не блокируются, поэтому страница
              доступна даже когда сайт закрыт прелоадером.
            </p>
          </div>
        </header>

        {needPass ? (
          <form
            onSubmit={savePass}
            className="mt-6 flex gap-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-4"
          >
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Админский пароль"
              autoComplete="current-password"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <button
              type="submit"
              className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
            >
              Войти
            </button>
          </form>
        ) : null}

        <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-white/80">Состояние</h2>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Обновить
            </button>
          </div>
          {!status ? (
            <p className="mt-2 text-xs text-white/40">Загрузка… (нужен вход в аккаунт)</p>
          ) : (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-white/40">Фича включена</dt>
              <dd className={status.enabled ? 'text-emerald-300' : 'text-white/60'}>
                {status.enabled ? 'да' : 'нет'}
              </dd>
              <dt className="text-white/40">Сайт закрыт</dt>
              <dd className={status.locked ? 'text-red-300' : 'text-white/60'}>
                {status.locked ? 'да' : 'нет'}
              </dd>
              <dt className="text-white/40">Дедлайн заявки</dt>
              <dd>{fmt(status.lockedUntil)}</dd>
              <dt className="text-white/40">Pending-заявка</dt>
              <dd className="break-all">
                {status.pending
                  ? `${status.pending.id.slice(0, 8)}… · ${status.pending.amount} ₽ · создана ${fmt(status.pending.createdAt)}`
                  : 'нет'}
              </dd>
              <dt className="text-white/40">Флаг localStorage</dt>
              <dd className={flag ? 'text-amber-300' : 'text-white/60'}>{flag ?? 'нет'}</dd>
            </dl>
          )}
        </section>

        <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-bold text-white/80">Сценарии</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('/api/devtest/lock/setup', undefined, 'просроченная заявка')}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50"
            >
              <Timer className="h-3.5 w-3.5" /> Составить просроченную заявку
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('/api/devtest/lock/pay', undefined, 'выплата')}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Отметить выплату
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('/api/devtest/lock/reject', undefined, 'отклонение')}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Отклонить с возвратом
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('/api/devtest/lock/reset', undefined, 'сброс')}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Удалить все выводы
            </button>
            <button
              type="button"
              disabled={busy || !status}
              onClick={() => void run('/api/devtest/lock/enabled', { enabled: !status?.enabled }, 'флаг фичи')}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-50"
            >
              <Power className="h-3.5 w-3.5" /> {status?.enabled ? 'Выключить фичу' : 'Включить фичу'}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
            <span className="text-xs text-white/50">Дедлайн через</span>
            <input
              value={seconds}
              onChange={(e) => setSeconds(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              className="w-14 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-center text-xs text-white outline-none"
            />
            <span className="text-xs text-white/50">сек.</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('/api/devtest/lock/deadline', { seconds: Number(seconds) || 10 }, 'таймер')}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 disabled:opacity-50"
            >
              <Timer className="h-3.5 w-3.5" /> Поставить таймер
            </button>
            <span className="text-[11px] text-white/40">
              Сразу открой /wallet — таймер должен выкинуть на прелоадер сам
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={clearFlag}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70"
            >
              <Trash2 className="h-3.5 w-3.5" /> Снять флаг localStorage
            </button>
            <Link
              href="/wallet"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70"
            >
              <Wallet className="h-3.5 w-3.5" /> Открыть /wallet
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70"
            >
              <ArrowRight className="h-3.5 w-3.5" /> Открыть главную
            </Link>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
          <h2 className="text-xs font-bold text-white/50">Лог</h2>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-white/60">
            {log.length === 0 ? 'пусто' : log.join('\n')}
          </pre>
        </section>

        <p className="mt-4 text-[11px] leading-relaxed text-white/40">
          Как проверить: «Составить просроченную заявку» → открой /wallet или главную — увидишь
          прелоадер без смены URL. Вернись сюда, нажми «Отметить выплату», обнови вкладку с
          сайтом — должна открыться настоящая страница. Для проверки таймера поставь дедлайн и
          сразу открой /wallet. Блок переживает выход из аккаунта: после сценария снимай флаг
          localStorage этой кнопкой.
        </p>
      </div>
    </main>
  );
}
