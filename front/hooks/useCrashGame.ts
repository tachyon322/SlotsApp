'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { CrashHistoryItem } from '@/lib/api';
import { avatarFor, randomNames } from '@/lib/names';
import {
  computeCrashPoint,
  generateSeed,
  multiplierFromTime,
} from '@/lib/crash/engine';
import { useUser } from '@/components/UserProvider';
import { showError } from '@/lib/toast';

export type Phase = 'betting' | 'flying' | 'crashed';

export interface BotBet {
  id: string;
  name: string;
  letter: string;
  color: string;
  amount: number;
  target: number;
  status: 'in' | 'cashed' | 'out';
  cashedAt: number | null;
}

export interface PlayerBet {
  amount: number;
  status: 'pending' | 'in' | 'cashed' | 'out';
  cashedAt: number | null;
  autoOn: boolean;
  autoTarget: number;
}

export interface Popup {
  id: string;
  amount: number;
}

export type LiveListener = () => void;

export interface CrashLive {
  subscribe: (cb: LiveListener) => () => void;
  getSnapshot: () => number;
}

export interface CrashState {
  phase: Phase;
  history: number[];
  roundHistory: CrashHistoryItem[];
  bots: BotBet[];
  player: PlayerBet | null;
  betAmount: number;
  autoOn: boolean;
  autoTarget: number;
  totalBets: number;
  popups: Popup[];
  bettingMsLeft: number;
  error: string | null;
}

const BETTING_MS = 5000;
const CRASHED_MS = 3000;
export const PRESETS = [10, 50, 100, 500, 1000];
const AUTO_MIN = 1.01;
const AUTO_MAX = 1000;

const BOT_TARGETS = [1.2, 1.35, 1.5, 1.7, 2, 2.3, 2.7, 3.2, 4, 5, 7, 10, 15, 20, 30, 50];
// веса — выше у младших таргетов (большинство ботов страхует маленький кэф)
const BOT_TARGET_WEIGHTS = [22, 18, 16, 13, 11, 9, 7, 6, 5, 4, 3, 2, 1.5, 1, 0.7, 0.3];

function weightedPick(values: number[], weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < values.length; i++) {
    r -= weights[i];
    if (r <= 0) return values[i];
  }
  return values[values.length - 1];
}

function makeBots(): BotBet[] {
  const n = 6 + Math.floor(Math.random() * 10); // 6..15
  const names = randomNames(n);
  return names.map((name, i) => {
    const av = avatarFor(name);
    return {
      id: `${Date.now()}-${i}`,
      name,
      letter: av.letter,
      color: av.color,
      amount: weightedPick(PRESETS, [40, 25, 18, 10, 7]),
      target: weightedPick(BOT_TARGETS, BOT_TARGET_WEIGHTS),
      status: 'in' as const,
      cashedAt: null,
    };
  });
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useCrashGame() {
  const { refresh: refreshUser } = useUser();

  const [state, setState] = useState<CrashState>({
    phase: 'betting',
    history: [],
    roundHistory: [],
    bots: [],
    player: null,
    betAmount: PRESETS[0],
    autoOn: false,
    autoTarget: 2,
    totalBets: 0,
    popups: [],
    bettingMsLeft: BETTING_MS,
    error: null,
  });

  // Прямые ссылки на «живые» значения для rAF-цикла (без dependence от React state).
  const phaseRef = useRef<Phase>('betting');
  const multiplierRef = useRef(1);
  const crashPointRef = useRef(1);
  const startMsRef = useRef(0);
  const bettingEndsAtRef = useRef(0);
  const crashedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);
  const playerRef = useRef<PlayerBet | null>(null);
  const botsRef = useRef<BotBet[]>([]);
  const autoTargetRef = useRef(2);
  const autoOnRef = useRef(false);
  const betAmountRef = useRef(PRESETS[0]);
  const busyRef = useRef(false);

  const liveListenersRef = useRef<Set<LiveListener>>(new Set());
  const liveValueRef = useRef(1);

  const subscribeLive = useCallback((cb: LiveListener) => {
    liveListenersRef.current.add(cb);
    return () => {
      liveListenersRef.current.delete(cb);
    };
  }, []);

  const getLiveSnapshot = useCallback(() => liveValueRef.current, []);

  const notifyLive = useCallback(() => {
    for (const l of liveListenersRef.current) l();
  }, []);

  const syncRefs = useCallback((s: CrashState) => {
    phaseRef.current = s.phase;
    playerRef.current = s.player;
    botsRef.current = s.bots;
    autoTargetRef.current = s.autoTarget;
  }, []);

  useEffect(() => {
    syncRefs(state);
  }, [state, syncRefs]);

  const emit = useCallback((patch: Partial<CrashState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      phaseRef.current = next.phase;
      playerRef.current = next.player;
      botsRef.current = next.bots;
      autoTargetRef.current = next.autoTarget;
      return next;
    });
  }, []);

  const setError = useCallback(
    (msg: string | null) => {
      showError(msg);
      emit({ error: msg });
    },
    [emit],
  );

  const addPopup = useCallback((amount: number) => {
    const id = uid();
    setState((prev) => ({ ...prev, popups: [...prev.popups, { id, amount }] }));
    setTimeout(() => {
      setState((prev) => ({ ...prev, popups: prev.popups.filter((p) => p.id !== id) }));
    }, 1600);
  }, []);

  const loadRoundHistory = useCallback(async () => {
    try {
      const res = await api.crashHistory(30);
      setState((prev) => ({ ...prev, roundHistory: res.items }));
    } catch {
      // история не критична — оставляем как есть
    }
  }, []);

  useEffect(() => {
    void loadRoundHistory();
  }, [loadRoundHistory]);

  const resolvePlayer = useCallback(
    (status: PlayerBet['status'], cashedAt: number | null) => {
      const p = playerRef.current;
      if (!p) return;
      playerRef.current = { ...p, status, cashedAt };
      emit({ player: playerRef.current });
    },
    [emit],
  );

  //cashout игрока: ручной или авто. Основной path.
  const doCashout = useCallback(async () => {
    const p = playerRef.current;
    if (!p || p.status !== 'in' || busyRef.current) return;
    busyRef.current = true;
    const m = multiplierRef.current;
    try {
      const res = await api.crashCashout(m, crashPointRef.current);
      resolvePlayer('cashed', m);
      addPopup(res.payout);
      void refreshUser();
      void loadRoundHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
    }
  }, [resolvePlayer, addPopup, refreshUser, setError, loadRoundHistory]);

  // cashout ботов в полёте
  const settleBots = useCallback((m: number) => {
    const bots = botsRef.current;
    let changed = false;
    for (const b of bots) {
      if (b.status === 'in' && m >= b.target) {
        b.status = 'cashed';
        b.cashedAt = b.target;
        changed = true;
      }
    }
    if (changed) emit({ bots: [...bots] });
  }, [emit]);

  // главный цикл полёта
  const tick = useCallback(() => {
    const now = performance.now();

    if (phaseRef.current === 'betting') {
      const left = Math.max(0, bettingEndsAtRef.current - now);
      // лёгкое обновление таймера ставок (~10fps достаточно)
      if (now - lastEmitRef.current > 100) {
        lastEmitRef.current = now;
        setState((prev) => ({ ...prev, bettingMsLeft: left }));
      }
      if (left <= 0) {
        // старт раунда: seed -> crashPoint, перевод игрока pending->in
        const seed = generateSeed();
        const cp = computeCrashPoint(seed);
        crashPointRef.current = cp;
        startMsRef.current = now;
        const p = playerRef.current;
        let nextPlayer = p;
        if (p && p.status === 'pending') {
          nextPlayer = { ...p, status: 'in' };
        }
        playerRef.current = nextPlayer;
        emit({ phase: 'flying', player: nextPlayer, bettingMsLeft: 0 });
        phaseRef.current = 'flying';
      }
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    if (phaseRef.current === 'flying') {
      const elapsedSec = (now - startMsRef.current) / 1000;
      const m = multiplierFromTime(elapsedSec);
      multiplierRef.current = m;

      // авто-вывод игрока
      const p = playerRef.current;
      if (p && p.status === 'in' && p.autoOn && p.autoTarget <= m) {
        void doCashout();
      }
      settleBots(m);

        if (m >= crashPointRef.current) {
          // КРАШ
          multiplierRef.current = crashPointRef.current;
          liveValueRef.current = crashPointRef.current;
          notifyLive();
          crashedAtRef.current = now;
        // ботам, не успевшим, — минус
        const bots = botsRef.current.map((b) =>
          b.status === 'in' ? { ...b, status: 'out' as const } : b,
        );
        botsRef.current = bots;
        // игрок не успел
        let player = playerRef.current;
        if (player && player.status === 'in') {
          void api
            .crashLose(crashPointRef.current)
            .then(() => {
              void refreshUser();
              void loadRoundHistory();
            })
            .catch(() => {});
          player = { ...player, status: 'out' };
          playerRef.current = player;
        }
        phaseRef.current = 'crashed';
        emit({
          phase: 'crashed',
          bots,
          player,
        });
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // throttled live-обновление множителя (~20fps — достаточно для числа).
      // Пишем вне React-состояния, чтобы не ререндерить всё дерево страницы.
      if (now - lastEmitRef.current > 50) {
        lastEmitRef.current = now;
        liveValueRef.current = m;
        notifyLive();
      }

      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    if (phaseRef.current === 'crashed') {
      if (now - crashedAtRef.current >= CRASHED_MS) {
        // новый раунд: генерация ботов, перенос истории
        const bots = makeBots();
        botsRef.current = bots;
        playerRef.current = null;
        phaseRef.current = 'betting';
        bettingEndsAtRef.current = now + BETTING_MS;
        lastEmitRef.current = now;
        setState((prev) => ({
          ...prev,
          phase: 'betting',
          bettingMsLeft: BETTING_MS,
          bots,
          player: null,
          history: [crashPointRef.current, ...prev.history].slice(0, 12),
          totalBets: bots.length,
        }));
        liveValueRef.current = 1;
        notifyLive();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [doCashout, settleBots, emit, refreshUser, loadRoundHistory, notifyLive]);

  // запуск цикла
  useEffect(() => {
    // первичная итерация ботов
    const bots = makeBots();
    botsRef.current = bots;
    bettingEndsAtRef.current = performance.now() + BETTING_MS;
    setState((prev) => ({ ...prev, bots, totalBets: bots.length, bettingMsLeft: BETTING_MS }));
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick]);

  // ---------- действия пользователя ----------

  const setBetAmount = useCallback((amount: number) => {
    betAmountRef.current = amount;
    setState((prev) => ({ ...prev, betAmount: amount }));
  }, []);

  const toggleAuto = useCallback((on: boolean) => {
    autoOnRef.current = on;
    setState((prev) => ({ ...prev, autoOn: on }));
  }, []);

  const stepAuto = useCallback(
    (delta: number) => {
      setState((prev) => {
        const next =
          Math.round((prev.autoTarget + delta) * 100) / 100;
        const clamped = Math.min(AUTO_MAX, Math.max(AUTO_MIN, next));
        autoTargetRef.current = clamped;
        return { ...prev, autoTarget: clamped };
      });
    },
    [],
  );

  const placeBet = useCallback(async () => {
    if (busyRef.current) return;
    if (phaseRef.current !== 'betting') return;
    // повторная ставка во время ожидания — не разрешаем (одна ставка на раунд)
    if (playerRef.current && playerRef.current.status === 'pending') return;
    const amount = betAmountRef.current;
    busyRef.current = true;
    const roundId = uid();
    try {
      await api.crashBet(amount, roundId);
      const p: PlayerBet = {
        amount,
        status: 'pending',
        cashedAt: null,
        autoOn: autoOnRef.current,
        autoTarget: autoTargetRef.current,
      };
      playerRef.current = p;
      emit({ player: p, totalBets: botsRef.current.length + 1, error: null });
      void refreshUser();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Войдите, чтобы ставить');
      } else {
        setError((e as Error).message || 'Не удалось поставить');
      }
    } finally {
      busyRef.current = false;
    }
  }, [emit, refreshUser, setError]);

  const cancelBet = useCallback(async () => {
    if (busyRef.current) return;
    const p = playerRef.current;
    if (!p || p.status !== 'pending') return;
    busyRef.current = true;
    try {
      await api.crashCancel();
      playerRef.current = null;
      emit({ player: null, totalBets: botsRef.current.length });
      void refreshUser();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
    }
  }, [emit, refreshUser, setError]);

  const manualCashout = useCallback(() => {
    void doCashout();
  }, [doCashout]);

  const actions = useMemo(
    () => ({
      setBetAmount,
      toggleAuto,
      stepAuto,
      placeBet,
      cancelBet,
      manualCashout,
    }),
    [setBetAmount, toggleAuto, stepAuto, placeBet, cancelBet, manualCashout],
  );

  // ссылки для canvas (читает напрямую, без перерисовок React)
  const refs = useMemo(
    () => ({
      multiplier: multiplierRef,
      crashPoint: crashPointRef,
      startMs: startMsRef,
      phase: phaseRef,
    }),
    [],
  );

  const live = useMemo<CrashLive>(
    () => ({ subscribe: subscribeLive, getSnapshot: getLiveSnapshot }),
    [subscribeLive, getLiveSnapshot],
  );

  return { state, actions, refs, live };
}