'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { api, type SlotsHistoryItem, type SlotsWinLineInfo } from '@/lib/api';
import { useUser } from '@/components/UserProvider';
import { soundEngine, ALL_SYMBOL_KEYS, getSymbolEmoji } from '@/lib/slots/engine';

export type SlotMode = 'classic' | 'mega';

const DEFAULT_3X3_GRID: string[][] = [
  ['🍋', '🔔', '💎'],
  ['⭐', '💰', '🍒'],
  ['7️⃣', '🍋', '🔔'],
];

const DEFAULT_5X3_GRID: string[][] = [
  ['🍋', '🔔', '💎', '⭐', '💰'],
  ['⭐', '💰', '🍒', '7️⃣', '🍋'],
  ['7️⃣', '🍋', '🔔', '💎', '🍒'],
];

export function useSlotsGame() {
  const { refresh: refreshUser } = useUser();
  const [mode, setModeState] = useState<SlotMode>('classic');
  const [activeLines, setActiveLines] = useState<number>(3);
  const [lineBet, setLineBet] = useState<number>(10);

  const [grid, setGrid] = useState<string[][]>(DEFAULT_3X3_GRID);
  const [spinning, setSpinning] = useState<boolean>(false);
  const [settledColumns, setSettledColumns] = useState<boolean[]>([true, true, true]);
  
  const [winLines, setWinLines] = useState<SlotsWinLineInfo[]>([]);
  const [lastPayout, setLastPayout] = useState<number>(0);
  const [lastMultiplier, setLastMultiplier] = useState<number>(0);
  const [outcome, setOutcome] = useState<'win' | 'loss' | 'ldw' | null>(null);
  
  const [history, setHistory] = useState<SlotsHistoryItem[]>([]);
  const [stats, setStats] = useState<{ totalWinnings: number; maxWin: number; totalCount: number }>({
    totalWinnings: 0,
    maxWin: 0,
    totalCount: 0,
  });

  const [error, setError] = useState<string | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);

  const totalBet = useMemo(() => activeLines * lineBet, [activeLines, lineBet]);

  // Load history on mount
  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.slotsHistory(30);
      setHistory(res.items);
      setStats(res.stats);
    } catch {
      // Ignore initial history fetch errors if unauthenticated
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const setMode = useCallback((newMode: SlotMode) => {
    if (spinning) return;
    setModeState(newMode);
    if (newMode === 'classic') {
      setActiveLines(3);
      setGrid(DEFAULT_3X3_GRID);
      setSettledColumns([true, true, true]);
    } else {
      setActiveLines(5);
      setGrid(DEFAULT_5X3_GRID);
      setSettledColumns([true, true, true, true, true]);
    }
    setWinLines([]);
    setOutcome(null);
  }, [spinning]);

  const winningCoords = useMemo(() => {
    const set = new Set<string>();
    for (const winLine of winLines) {
      for (const [r, c] of winLine.coords) {
        set.add(`${r}-${c}`);
      }
    }
    return set;
  }, [winLines]);

  const spin = useCallback(async () => {
    if (spinning) return;

    setError(null);
    setSpinning(true);
    setWinLines([]);
    setOutcome(null);
    setLastPayout(0);
    setLastMultiplier(0);

    const colsCount = mode === 'mega' ? 5 : 3;
    setSettledColumns(new Array(colsCount).fill(false));

    // Sound effect
    soundEngine.playSpin();

    try {
      const res = await api.slotsSpin(mode, activeLines, lineBet);

      // Convert backend symbol IDs matrix to Emoji matrix
      const emojiGrid = res.grid.map((row) => row.map((symId) => getSymbolEmoji(symId)));

      // Refresh user balance in header
      void refreshUser();

      // Staggered reel stop animation
      for (let col = 0; col < colsCount; col++) {
        await new Promise((resolve) => setTimeout(resolve, 300 + col * 200));

        soundEngine.playLand();

        setGrid((prevGrid) => {
          const nextGrid = prevGrid.map((row) => [...row]);
          for (let r = 0; r < 3; r++) {
            nextGrid[r][col] = emojiGrid[r][col];
          }
          return nextGrid;
        });

        setSettledColumns((prev) => {
          const next = [...prev];
          next[col] = true;
          return next;
        });
      }

      // Finish spin
      setWinLines(res.winLines);
      setLastPayout(res.totalPayout);
      setLastMultiplier(res.multiplier);
      setOutcome(res.outcome);

      if (res.totalPayout > 0) {
        soundEngine.playWin();
      }

      void fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка подключения');
      setSettledColumns(new Array(colsCount).fill(true));
    } finally {
      setSpinning(false);
    }
  }, [spinning, mode, activeLines, lineBet, refreshUser, fetchHistory]);

  return {
    state: {
      mode,
      activeLines,
      lineBet,
      totalBet,
      grid,
      spinning,
      settledColumns,
      winLines,
      winningCoords,
      lastPayout,
      lastMultiplier,
      outcome,
      history,
      stats,
      error,
      isRulesOpen,
    },
    actions: {
      setMode,
      setActiveLines,
      setLineBet,
      spin,
      setIsRulesOpen,
      fetchHistory,
    },
  };
}
