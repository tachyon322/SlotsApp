'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { MinedropHistoryItem } from '@/lib/api';
import { useUser } from '@/components/UserProvider';
import { showError } from '@/lib/toast';
import {
  DEFAULT_BET,
  EMPTY_TOOL,
  FIELD_COLS,
  SLOTS_PER_COL,
  resolveSpin,
  type SpinResult,
} from '@/lib/minedrop/engine';

export type Phase = 'idle' | 'spinning' | 'resolved';
export type ReelState = 'spinning' | 'stopped' | 'falling' | 'crashed';

export interface Receipt {
  bet: number;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss';
  result: SpinResult;
}

export interface MinedropState {
  phase: Phase;
  betAmount: number;
  reels: string[][];
  reelState: ReelState[];
  destroyed: number[];
  jackpots: boolean[];
  result: SpinResult | null;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss' | null;
  receipt: Receipt | null;
  history: MinedropHistoryItem[];
  error: string | null;
  rulesOpen: boolean;
  receiptOpen: boolean;
}

const HISTORY_LIMIT = 30;

// Тайминги анимации спина (мс).
const SPIN_MS = 1300;
const STOP_GAP_MS = 550;
const FALL_MS = 800;
const SETTLE_MS = 500;

const PREVIEW_TOOLS = [
  'wooden_shovel',
  'iron_shovel',
  'diamond_shovel',
  'wooden_axe',
  'iron_axe',
  'diamond_axe',
  'wooden_pickaxe',
  'iron_pickaxe',
  'diamond_pickaxe',
  'eye',
];

function randomPreview(): string[][] {
  return Array.from({ length: FIELD_COLS }, () =>
    Array.from({ length: SLOTS_PER_COL }, () =>
      Math.random() < 0.08
        ? EMPTY_TOOL
        : PREVIEW_TOOLS[Math.floor(Math.random() * PREVIEW_TOOLS.length)],
    ),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useMinedropGame() {
  const { refresh: refreshUser } = useUser();

  const [state, setState] = useState<MinedropState>({
    phase: 'idle',
    betAmount: DEFAULT_BET,
    reels: randomPreview(),
    reelState: Array.from({ length: FIELD_COLS }, () => 'stopped'),
    destroyed: Array.from({ length: FIELD_COLS }, () => 0),
    jackpots: Array.from({ length: FIELD_COLS }, () => false),
    result: null,
    multiplier: 0,
    payout: 0,
    outcome: null,
    receipt: null,
    history: [],
    error: null,
    rulesOpen: false,
    receiptOpen: false,
  });

  const phaseRef = useRef<Phase>('idle');
  const busyRef = useRef(false);
  const runIdRef = useRef(0);

  const setError = useCallback((msg: string | null) => {
    showError(msg);
    setState((prev) => ({ ...prev, error: msg }));
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.minedropHistory(HISTORY_LIMIT);
      setState((prev) => ({ ...prev, history: res.items }));
    } catch {
      // история не критична — оставляем как есть
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      runIdRef.current += 1;
    };
  }, []);

  const setBetAmount = useCallback((amount: number) => {
    setState((prev) => {
      if (prev.phase !== 'idle') return prev;
      return { ...prev, betAmount: amount };
    });
  }, []);

  const startGame = useCallback(async () => {
    if (busyRef.current) return;
    if (phaseRef.current !== 'idle') return;
    busyRef.current = true;
    try {
      await api.minedropBet(state.betAmount);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Войдите, чтобы ставить');
      } else {
        setError((e as Error).message || 'Не удалось начать игру');
      }
      busyRef.current = false;
      return;
    }

    const result = resolveSpin();
    const runId = ++runIdRef.current;
    phaseRef.current = 'spinning';
    setState((prev) => ({
      ...prev,
      phase: 'spinning',
      error: null,
      reels: result.columns.map((c) => c.slots),
      reelState: Array.from({ length: FIELD_COLS }, () => 'spinning'),
      destroyed: Array.from({ length: FIELD_COLS }, () => 0),
      jackpots: result.columns.map((c) => c.jackpot),
      result: null,
      multiplier: 0,
      payout: 0,
      outcome: null,
    }));
    void refreshUser();

    // Остановка колонн одна за другой + падение инструментов и краш блоков.
    for (let c = 0; c < FIELD_COLS; c++) {
      await sleep(c === 0 ? SPIN_MS : STOP_GAP_MS);
      if (runIdRef.current !== runId) return;
      setState((prev) => {
        const reelState = [...prev.reelState];
        reelState[c] = 'falling';
        const destroyed = [...prev.destroyed];
        destroyed[c] = result.columns[c].destroyed;
        return { ...prev, reelState, destroyed };
      });
      await sleep(FALL_MS);
      if (runIdRef.current !== runId) return;
      setState((prev) => {
        const reelState = [...prev.reelState];
        reelState[c] = 'crashed';
        return { ...prev, reelState };
      });
    }

    await sleep(SETTLE_MS);
    if (runIdRef.current !== runId) return;

    // Фиксируем результат на сервере.
    try {
      const details = JSON.stringify(
        result.columns.map((c) => ({ slots: c.slots, multiplier: c.multiplier })),
      );
      const res = await api.minedropFinish(result.multiplier, details);
      const payout = res.payout;
      const effectiveMultiplier = res.multiplier;
      const outcome: 'win' | 'loss' = payout >= state.betAmount ? 'win' : 'loss';
      phaseRef.current = 'resolved';
      setState((prev) => ({
        ...prev,
        phase: 'resolved',
        result,
        multiplier: effectiveMultiplier,
        payout,
        outcome,
        receipt: { bet: state.betAmount, multiplier: effectiveMultiplier, payout, outcome, result },
      }));
      void refreshUser();
      void loadHistory();
    } catch (e) {
      setError((e as Error).message || 'Не удалось завершить раунд');
      phaseRef.current = 'resolved';
      setState((prev) => ({ ...prev, phase: 'resolved', result, payout: 0, outcome: null }));
    } finally {
      busyRef.current = false;
    }
  }, [state.betAmount, refreshUser, setError, loadHistory]);

  const playAgain = useCallback(() => {
    if (busyRef.current) return;
    if (phaseRef.current === 'spinning') return;
    runIdRef.current += 1;
    phaseRef.current = 'idle';
    setState((prev) => ({
      ...prev,
      phase: 'idle',
      reels: randomPreview(),
      reelState: Array.from({ length: FIELD_COLS }, () => 'stopped'),
      destroyed: Array.from({ length: FIELD_COLS }, () => 0),
      jackpots: Array.from({ length: FIELD_COLS }, () => false),
      result: null,
      payout: 0,
      outcome: null,
      receipt: null,
      error: null,
    }));
  }, []);

  const openRules = useCallback(() => {
    if (phaseRef.current === 'spinning') return;
    setState((prev) => ({ ...prev, rulesOpen: true }));
  }, []);

  const closeRules = useCallback(() => {
    setState((prev) => ({ ...prev, rulesOpen: false }));
  }, []);

  const openReceipt = useCallback(() => {
    if (phaseRef.current !== 'resolved') return;
    setState((prev) => ({ ...prev, receiptOpen: true }));
  }, []);

  const closeReceipt = useCallback(() => {
    setState((prev) => ({ ...prev, receiptOpen: false }));
  }, []);

  const actions = useMemo(
    () => ({
      setBetAmount,
      startGame,
      playAgain,
      openRules,
      closeRules,
      openReceipt,
      closeReceipt,
    }),
    [setBetAmount, startGame, playAgain, openRules, closeRules, openReceipt, closeReceipt],
  );

  return { state, actions };
}
