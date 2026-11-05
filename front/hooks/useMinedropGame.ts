'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { MinedropHistoryItem } from '@/lib/api';
import { useUser } from '@/components/UserProvider';
import { showError } from '@/lib/toast';
import { DEFAULT_BET } from '@/lib/minedrop/engine';
import { ENGINE_VERSION, simulateRound, type PickaxeRound } from '@/lib/minedrop/pickaxeEngine';

export type Phase = 'idle' | 'playing' | 'resolved';

export interface Receipt {
  bet: number;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss';
  round: PickaxeRound;
}

export interface MinedropState {
  phase: Phase;
  betAmount: number;
  round: PickaxeRound | null;
  /** Счётчик раундов — меняется на каждый старт, перезапускает анимацию. */
  runKey: number;
  /** ₽ за 1 «тысячную ставки» движка с учётом регулятора выплат. */
  rubPerUnit: number;
  /** Накопленный выигрыш по ходу анимации. */
  liveWin: number;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss' | null;
  receipt: Receipt | null;
  history: MinedropHistoryItem[];
  turbo: boolean;
  rulesOpen: boolean;
  receiptOpen: boolean;
}

const HISTORY_LIMIT = 30;
const TURBO_KEY = 'minedrop:turbo';

function readTurbo(): boolean {
  try {
    return localStorage.getItem(TURBO_KEY) === '1';
  } catch {
    return false;
  }
}

export function useMinedropGame() {
  const { refresh: refreshUser } = useUser();

  const [state, setState] = useState<MinedropState>({
    phase: 'idle',
    betAmount: DEFAULT_BET,
    round: null,
    runKey: 0,
    rubPerUnit: 0,
    liveWin: 0,
    multiplier: 0,
    payout: 0,
    outcome: null,
    receipt: null,
    history: [],
    turbo: false,
    rulesOpen: false,
    receiptOpen: false,
  });

  const phaseRef = useRef<Phase>('idle');
  const busyRef = useRef(false);

  useEffect(() => {
    setState((prev) => ({ ...prev, turbo: readTurbo() }));
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

  const setBetAmount = useCallback((amount: number) => {
    setState((prev) => (prev.phase === 'playing' ? prev : { ...prev, betAmount: amount }));
  }, []);

  const startGame = useCallback(async () => {
    if (busyRef.current || phaseRef.current === 'playing') return;
    busyRef.current = true;
    const bet = state.betAmount;

    let res;
    try {
      res = await api.minedropBet(bet);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) showError('Войдите, чтобы ставить');
      else showError((e as Error).message || 'Не удалось начать игру');
      busyRef.current = false;
      return;
    }

    if (res.version !== ENGINE_VERSION) {
      // Клиент устарел: деньги уже рассчитаны сервером, просто без анимации.
      console.warn('[minedrop] engine version mismatch', res.version, ENGINE_VERSION);
    }

    const round = simulateRound(res.seed, true);
    const rawTotal = round.rawValue;
    // Масштаб «тысячных ставки» в рубли так, чтобы сумма по анимации сошлась с выплатой.
    const rubPerUnit = rawTotal > 0 ? res.payout / rawTotal : 0;
    const outcome: 'win' | 'loss' = res.payout >= bet ? 'win' : 'loss';

    phaseRef.current = 'playing';
    setState((prev) => ({
      ...prev,
      phase: 'playing',
      round,
      runKey: prev.runKey + 1,
      rubPerUnit,
      liveWin: 0,
      multiplier: res.multiplier,
      payout: res.payout,
      outcome,
      receipt: { bet, multiplier: res.multiplier, payout: res.payout, outcome, round },
      rulesOpen: false,
      receiptOpen: false,
    }));
  }, [state.betAmount]);

  /** Вызывается сценой по ходу анимации: накопленная стоимость в «тысячных». */
  const onProgress = useCallback((totalUnits: number) => {
    setState((prev) => ({ ...prev, liveWin: Math.round(totalUnits * prev.rubPerUnit) }));
  }, []);

  /** Анимация раунда закончилась. */
  const onDone = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    phaseRef.current = 'resolved';
    busyRef.current = false;
    setState((prev) => ({ ...prev, phase: 'resolved', liveWin: prev.payout }));
    void refreshUser();
    void loadHistory();
  }, [refreshUser, loadHistory]);

  const toggleTurbo = useCallback(() => {
    setState((prev) => {
      const turbo = !prev.turbo;
      try {
        localStorage.setItem(TURBO_KEY, turbo ? '1' : '0');
      } catch {
        // без localStorage просто не запоминаем
      }
      return { ...prev, turbo };
    });
  }, []);

  const openRules = useCallback(() => setState((prev) => ({ ...prev, rulesOpen: true })), []);
  const closeRules = useCallback(() => setState((prev) => ({ ...prev, rulesOpen: false })), []);
  const openReceipt = useCallback(() => {
    if (phaseRef.current !== 'resolved') return;
    setState((prev) => ({ ...prev, receiptOpen: true }));
  }, []);
  const closeReceipt = useCallback(() => setState((prev) => ({ ...prev, receiptOpen: false })), []);

  const actions = useMemo(
    () => ({
      setBetAmount,
      startGame,
      onProgress,
      onDone,
      toggleTurbo,
      openRules,
      closeRules,
      openReceipt,
      closeReceipt,
    }),
    [setBetAmount, startGame, onProgress, onDone, toggleTurbo, openRules, closeRules, openReceipt, closeReceipt],
  );

  return { state, actions };
}
