'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { BlockblastHistoryItem } from '@/lib/api';
import { useUser } from '@/components/UserProvider';
import { showError } from '@/lib/toast';
import {
  DEFAULT_BET,
  TARGET_PLACEMENTS,
  canAnyPiecePlace,
  emptyBoard,
  findBestPlacement,
  moveTime,
  multiplierFor,
  placePiece,
  randomPalette,
  randomShape,
  type Shape,
} from '@/lib/blockblast/engine';

export type Phase = 'idle' | 'playing' | 'won' | 'lost';
export type TimerLevel = 'ok' | 'warn' | 'danger';
export type ClearInfo = { rows: number[]; cols: number[] } | null;

export interface BlockBlastState {
  phase: Phase;
  betAmount: number;
  board: number[][];
  palette: Shape[];
  placements: number;
  lineBonusTotal: number;
  multiplier: number;
  take: number;
  nextMult: number;
  cashoutAvailable: boolean;
  timer: { remaining: number; duration: number } | null;
  timerLevel: TimerLevel;
  clearing: ClearInfo;
  selectedSlot: number | null;
  settlement: { payout: number; total: number; refund: boolean } | null;
  history: BlockblastHistoryItem[];
  error: string | null;
  modalOpen: boolean;
}

const HISTORY_LIMIT = 30;
const CLEAR_DELAY_MS = 460;
const TICK_MS = 100;

function computeTake(bet: number, placements: number, lineBonusTotal: number): number {
  return Math.round(bet * multiplierFor(placements)) + lineBonusTotal;
}

export function useBlockBlastGame() {
  const { refresh: refreshUser } = useUser();

  const [state, setState] = useState<BlockBlastState>({
    phase: 'idle',
    betAmount: DEFAULT_BET,
    board: emptyBoard(),
    palette: randomPalette(),
    placements: 0,
    lineBonusTotal: 0,
    multiplier: 0,
    take: 0,
    nextMult: multiplierFor(1),
    cashoutAvailable: false,
    timer: null,
    timerLevel: 'ok',
    clearing: null,
    selectedSlot: null,
    settlement: null,
    history: [],
    error: null,
    modalOpen: false,
  });

  const phaseRef = useRef<Phase>('idle');
  const busyRef = useRef(false);
  const boardRef = useRef<number[][]>(emptyBoard());
  const paletteRef = useRef<Shape[]>(randomPalette());
  const placementsRef = useRef(0);
  const lineBonusRef = useRef(0);
  const betRef = useRef(DEFAULT_BET);
  const deadlineRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setError = useCallback((msg: string | null) => {
    showError(msg);
    setState((prev) => ({ ...prev, error: msg }));
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.blockblastHistory(HISTORY_LIMIT);
      setState((prev) => ({ ...prev, history: res.items }));
    } catch {
      // история не критична — оставляем как есть
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const settleEarly = useCallback(async () => {
    if (phaseRef.current !== 'playing') return;
    stopTimer();
    const placements = placementsRef.current;
    busyRef.current = true;
    phaseRef.current = placements >= TARGET_PLACEMENTS ? 'won' : 'lost';
    try {
      if (placements >= TARGET_PLACEMENTS) {
        const mult = multiplierFor(placements);
        const res = await api.blockblastCashout(mult, placements);
        setState((prev) => ({
          ...prev,
          phase: 'won',
          timer: null,
          settlement: {
            payout: res.payout,
            total: res.payout + lineBonusRef.current,
            refund: false,
          },
        }));
      } else {
        const res = await api.blockblastEnd(placements);
        setState((prev) => ({
          ...prev,
          phase: 'lost',
          timer: null,
          settlement: {
            payout: res.payout,
            total: res.payout + lineBonusRef.current,
            refund: true,
          },
        }));
      }
      void refreshUser();
      void loadHistory();
    } catch (e) {
      setError((e as Error).message);
      phaseRef.current = 'playing';
    } finally {
      busyRef.current = false;
    }
  }, [refreshUser, loadHistory, setError, stopTimer]);

  const startMoveTimer = useCallback((placements: number) => {
    stopTimer();
    const duration = moveTime(placements);
    deadlineRef.current = Date.now() + duration * 1000;
    const update = () => {
      const remaining = Math.max(0, (deadlineRef.current - Date.now()) / 1000);
      const frac = remaining / duration;
      setState((prev) => ({
        ...prev,
        timer: { remaining, duration },
        timerLevel: frac > 0.5 ? 'ok' : frac > 0.25 ? 'warn' : 'danger',
      }));
      if (remaining <= 0) {
        stopTimer();
        void settleEarly();
      }
    };
    update();
    timerRef.current = setInterval(update, TICK_MS);
  }, [stopTimer, settleEarly]);

  const finishMove = useCallback(
    (board: number[][], nextPlacements: number) => {
      busyRef.current = false;
      boardRef.current = board;
      placementsRef.current = nextPlacements;
      const canContinue = canAnyPiecePlace(board, paletteRef.current);
      setState((prev) => ({
        ...prev,
        board,
        placements: nextPlacements,
        clearing: null,
        selectedSlot: null,
        multiplier: multiplierFor(nextPlacements),
        take: computeTake(betRef.current, nextPlacements, lineBonusRef.current),
        nextMult: multiplierFor(nextPlacements + 1),
        cashoutAvailable: nextPlacements >= TARGET_PLACEMENTS,
      }));

      if (canContinue) {
        if (phaseRef.current === 'playing') startMoveTimer(nextPlacements);
      } else {
        void settleEarly();
      }
    },
    [startMoveTimer, settleEarly],
  );

  const place = useCallback(
    async (paletteIndex: number, row: number, col: number) => {
      if (busyRef.current) return;
      if (phaseRef.current !== 'playing') return;
      const shape = paletteRef.current[paletteIndex];
      if (!shape) return;
      const best = findBestPlacement(boardRef.current, shape, row, col);
      if (!best) return;
      const result = placePiece(boardRef.current, shape, best.row, best.col);
      if (!result) return;

      const nextPlacements = placementsRef.current + 1;
      const placed = boardRef.current.map((r) => [...r]);
      const shapeCoords = shape.cells.flatMap((r, ri) =>
        r.map((v, ci) => (v === 1 ? [best.row + ri, best.col + ci] : null)).filter(Boolean),
      ) as Array<[number, number]>;
      shapeCoords.forEach(([r, c]) => {
        placed[r][c] = 1;
      });
      boardRef.current = placed;

      const newPalette = [...paletteRef.current];
      newPalette[paletteIndex] = randomShape();
      paletteRef.current = newPalette;

      busyRef.current = true;
      stopTimer();

      setState((prev) => ({
        ...prev,
        board: placed,
        palette: newPalette,
        clearing: result.linesCleared > 0 ? { rows: result.clearedRows, cols: result.clearedCols } : null,
        placements: nextPlacements,
        selectedSlot: null,
        multiplier: multiplierFor(nextPlacements),
        take: computeTake(betRef.current, nextPlacements, lineBonusRef.current),
        nextMult: multiplierFor(nextPlacements + 1),
        cashoutAvailable: nextPlacements >= TARGET_PLACEMENTS,
      }));

      if (result.linesCleared > 0) {
        try {
          const res = await api.blockblastLine(result.linesCleared);
          lineBonusRef.current += res.added;
          setState((prev) => ({
            ...prev,
            lineBonusTotal: lineBonusRef.current,
            take: computeTake(betRef.current, nextPlacements, lineBonusRef.current),
          }));
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            // Раунд уже закрыт на сервере — прерываем игру.
            phaseRef.current = 'lost';
            setState((prev) => ({ ...prev, phase: 'lost', timer: null }));
          } else {
            setError((e as Error).message);
          }
        }
        if (clearRef.current) clearTimeout(clearRef.current);
        clearRef.current = setTimeout(() => {
          clearRef.current = null;
          finishMove(result.board, nextPlacements);
        }, CLEAR_DELAY_MS);
      } else {
        finishMove(result.board, nextPlacements);
      }
    },
    [finishMove, setError, stopTimer],
  );

  const cashout = useCallback(async () => {
    if (busyRef.current) return;
    if (phaseRef.current !== 'playing') return;
    if (placementsRef.current < TARGET_PLACEMENTS) return;
    busyRef.current = true;
    phaseRef.current = 'won';
    stopTimer();
    const placements = placementsRef.current;
    const mult = multiplierFor(placements);
    try {
      const res = await api.blockblastCashout(mult, placements);
      setState((prev) => ({
        ...prev,
        phase: 'won',
        timer: null,
        settlement: {
          payout: res.payout,
          total: res.payout + lineBonusRef.current,
          refund: false,
        },
      }));
      void refreshUser();
      void loadHistory();
    } catch (e) {
      setError((e as Error).message);
      phaseRef.current = 'playing';
    } finally {
      busyRef.current = false;
    }
  }, [refreshUser, loadHistory, setError, stopTimer]);

  const setBetAmount = useCallback((amount: number) => {
    setState((prev) => {
      if (prev.phase !== 'idle') return prev;
      return { ...prev, betAmount: amount };
    });
  }, []);

  const openModal = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    setState((prev) => ({ ...prev, modalOpen: true, error: null }));
  }, []);

  const cancelStart = useCallback(() => {
    setState((prev) => ({ ...prev, modalOpen: false }));
  }, []);

  const startGame = useCallback(async () => {
    if (busyRef.current) return;
    if (phaseRef.current !== 'idle') return;
    busyRef.current = true;
    try {
      await api.blockblastBet(state.betAmount);
      betRef.current = state.betAmount;
      boardRef.current = emptyBoard();
      placementsRef.current = 0;
      lineBonusRef.current = 0;
      paletteRef.current = randomPalette();
      phaseRef.current = 'playing';
      setState((prev) => ({
        ...prev,
        phase: 'playing',
        modalOpen: false,
        board: boardRef.current,
        palette: paletteRef.current,
        placements: 0,
        lineBonusTotal: 0,
        multiplier: 0,
        take: 0,
        nextMult: multiplierFor(1),
        cashoutAvailable: false,
        clearing: null,
        selectedSlot: null,
        settlement: null,
        error: null,
        timer: null,
      }));
      void refreshUser();
      startMoveTimer(0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Войдите, чтобы ставить');
      } else {
        setError((e as Error).message || 'Не удалось начать игру');
      }
    } finally {
      busyRef.current = false;
    }
  }, [state.betAmount, refreshUser, setError, startMoveTimer]);

  const playAgain = useCallback(() => {
    if (busyRef.current) return;
    if (phaseRef.current === 'playing') return;
    stopTimer();
    if (clearRef.current) {
      clearTimeout(clearRef.current);
      clearRef.current = null;
    }
    phaseRef.current = 'idle';
    boardRef.current = emptyBoard();
    placementsRef.current = 0;
    lineBonusRef.current = 0;
    setState((prev) => ({
      ...prev,
      phase: 'idle',
      board: emptyBoard(),
      placements: 0,
      lineBonusTotal: 0,
      multiplier: 0,
      take: 0,
      nextMult: multiplierFor(1),
      cashoutAvailable: false,
      timer: null,
      clearing: null,
      selectedSlot: null,
      settlement: null,
      error: null,
    }));
  }, [stopTimer]);

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      stopTimer();
      if (clearRef.current) clearTimeout(clearRef.current);
    };
  }, [stopTimer]);

  const selectSlot = useCallback((index: number) => {
    if (busyRef.current) return;
    if (phaseRef.current !== 'playing') return;
    setState((prev) => ({
      ...prev,
      selectedSlot: prev.selectedSlot === index ? null : index,
    }));
  }, []);

  const actions = useMemo(
    () => ({
      setBetAmount,
      openModal,
      cancelStart,
      startGame,
      place,
      cashout,
      selectSlot,
      playAgain,
    }),
    [setBetAmount, openModal, cancelStart, startGame, place, cashout, selectSlot, playAgain],
  );

  return { state, actions };
}
