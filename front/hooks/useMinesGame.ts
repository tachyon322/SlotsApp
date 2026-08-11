'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { MinesHistoryItem } from '@/lib/api';
import { useUser } from '@/components/UserProvider';
import { showError } from '@/lib/toast';
import {
  DEFAULT_BET,
  DEFAULT_DIFFICULTY_MINES,
  GRID_SIZE,
  generateMinefield,
  multiplierForReveals,
} from '@/lib/mines/engine';

export type Phase = 'idle' | 'playing' | 'won' | 'lost';
export type CellStatus = 'hidden' | 'safe' | 'mine';

export interface MinesState {
  phase: Phase;
  mines: number;
  betAmount: number;
  cells: CellStatus[];
  minefield: number[] | null;
  revealed: number;
  freshCell: number | null;
  history: MinesHistoryItem[];
  error: string | null;
}

const HISTORY_LIMIT = 30;

export function useMinesGame() {
  const { refresh: refreshUser } = useUser();

  const [state, setState] = useState<MinesState>({
    phase: 'idle',
    mines: DEFAULT_DIFFICULTY_MINES,
    betAmount: DEFAULT_BET,
    cells: Array.from({ length: GRID_SIZE }, () => 'hidden'),
    minefield: null,
    revealed: 0,
    freshCell: null,
    history: [],
    error: null,
  });

  const phaseRef = useRef<Phase>('idle');
  const busyRef = useRef(false);
  const minefieldRef = useRef<number[] | null>(null);
  const revealedRef = useRef(0);
  const revealedSetRef = useRef<Set<number>>(new Set());

  const setError = useCallback((msg: string | null) => {
    showError(msg);
    setState((prev) => ({ ...prev, error: msg }));
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.minesHistory(HISTORY_LIMIT);
      setState((prev) => ({ ...prev, history: res.items }));
    } catch {
      // история не критична — оставляем как есть
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const setDifficulty = useCallback((mines: number) => {
    setState((prev) => {
      if (prev.phase !== 'idle') return prev;
      return { ...prev, mines };
    });
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
      await api.minesBet(state.betAmount, state.mines);
      const field = generateMinefield(state.mines);
      minefieldRef.current = field;
      revealedRef.current = 0;
      revealedSetRef.current = new Set();
      phaseRef.current = 'playing';
      setState((prev) => ({
        ...prev,
        phase: 'playing',
        minefield: field,
        cells: Array.from({ length: GRID_SIZE }, () => 'hidden'),
        revealed: 0,
        freshCell: null,
        error: null,
      }));
      void refreshUser();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Войдите, чтобы ставить');
      } else {
        setError((e as Error).message || 'Не удалось начать игру');
      }
    } finally {
      busyRef.current = false;
    }
  }, [state.betAmount, state.mines, refreshUser, setError]);

  const revealCell = useCallback(
    async (index: number) => {
      if (busyRef.current) return;
      if (phaseRef.current !== 'playing') return;
      if (revealedSetRef.current.has(index)) return;
      const field = minefieldRef.current;
      if (!field) return;

      const isMine = field.includes(index);
      if (isMine) {
        // Подрыв: открываем все мины, сервер фиксирует проигрыш.
        revealedSetRef.current.add(index);
        busyRef.current = true;
        phaseRef.current = 'lost';
        const opened = revealedRef.current;
        setState((prev) => ({
          ...prev,
          phase: 'lost',
          cells: prev.cells.map((c, i) => (field.includes(i) ? 'mine' : c)),
          freshCell: null,
        }));
        try {
          await api.minesLose(opened);
          void refreshUser();
          void loadHistory();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          busyRef.current = false;
        }
        return;
      }

      // Безопасная клетка.
      revealedSetRef.current.add(index);
      revealedRef.current += 1;
      const revealed = revealedRef.current;
      setState((prev) => {
        const cells = [...prev.cells];
        cells[index] = 'safe';
        return { ...prev, cells, revealed, freshCell: index };
      });
    },
    [refreshUser, loadHistory, setError],
  );

  const cashout = useCallback(async () => {
    if (busyRef.current) return;
    if (phaseRef.current !== 'playing') return;
    const opened = revealedRef.current;
    if (opened < 1) return;
    busyRef.current = true;
    const mines = state.mines;
    const multiplier = multiplierForReveals(mines, opened);
    try {
      await api.minesCashout(multiplier, opened);
      phaseRef.current = 'won';
      setState((prev) => ({ ...prev, phase: 'won', freshCell: null }));
      void refreshUser();
      void loadHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
    }
  }, [state.mines, refreshUser, loadHistory, setError]);

  const playAgain = useCallback(() => {
    if (busyRef.current) return;
    if (phaseRef.current === 'playing') return;
    minefieldRef.current = null;
    revealedRef.current = 0;
    revealedSetRef.current = new Set();
    phaseRef.current = 'idle';
    setState((prev) => ({
      ...prev,
      phase: 'idle',
      minefield: null,
      cells: Array.from({ length: GRID_SIZE }, () => 'hidden'),
      revealed: 0,
      freshCell: null,
      error: null,
    }));
  }, []);

  const actions = useMemo(
    () => ({ setDifficulty, setBetAmount, startGame, revealCell, cashout, playAgain }),
    [setDifficulty, setBetAmount, startGame, revealCell, cashout, playAgain],
  );

  return { state, actions };
}
