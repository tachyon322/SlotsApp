'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { api, type CasesHistoryItem, type CaseLineResult } from '@/lib/api';
import { useUser } from '@/components/UserProvider';
import { soundEngine, CASES_LIST, RARITY_STYLES, type CaseRarity } from '@/lib/cases/engine';

export function useCasesGame() {
  const { refresh: refreshUser } = useUser();

  const [activeCaseId, setActiveCaseIdState] = useState<string>('common');
  const [activeLines, setActiveLinesState] = useState<number>(1);

  const [spinning, setSpinning] = useState<boolean>(false);
  const [spinId, setSpinId] = useState<number>(0);
  const [settled, setSettled] = useState<boolean>(false);
  const [settledLines, setSettledLines] = useState<boolean[]>([true]);

  const [linesData, setLinesData] = useState<CaseLineResult[]>([]);
  const [lastPayout, setLastPayout] = useState<number>(0);
  const [lastMultiplier, setLastMultiplier] = useState<number>(0);
  const [outcome, setOutcome] = useState<'win' | 'loss' | 'neutral' | null>(null);
  const [maxRarity, setMaxRarity] = useState<CaseRarity | null>(null);

  const [history, setHistory] = useState<CasesHistoryItem[]>([]);
  const [stats, setStats] = useState<{ totalWinnings: number; maxWin: number; totalCount: number }>({
    totalWinnings: 0,
    maxWin: 0,
    totalCount: 0,
  });

  const [error, setError] = useState<string | null>(null);
  const [isContentsModalOpen, setIsContentsModalOpen] = useState<boolean>(false);
  const [selectedReceiptItem, setSelectedReceiptItem] = useState<CasesHistoryItem | null>(null);

  const activeCase = useMemo(() => {
    return CASES_LIST.find((c) => c.id === activeCaseId) || CASES_LIST[0];
  }, [activeCaseId]);

  const totalBet = useMemo(() => {
    return activeCase.price * activeLines;
  }, [activeCase.price, activeLines]);

  const maxPayout = useMemo(() => {
    // Max multiplier is ~48.39 (for mythic) or higher up to 200
    const maxMult = 48.3951;
    return Number((activeCase.price * maxMult * activeLines).toFixed(2));
  }, [activeCase.price, activeLines]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.casesHistory(30);
      setHistory(res.items);
      setStats(res.stats);
    } catch {
      // Ignore unauthorized fetch
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const setActiveCaseId = useCallback((caseId: string) => {
    if (spinning) return;
    setActiveCaseIdState(caseId);
    setSettled(false);
    setOutcome(null);
  }, [spinning]);

  const setActiveLines = useCallback((lines: number) => {
    if (spinning) return;
    setActiveLinesState(lines);
    setSettledLines(new Array(lines).fill(true));
    setSettled(false);
    setOutcome(null);
  }, [spinning]);

  const spin = useCallback(async () => {
    if (spinning) return;

    setError(null);
    setSpinId((prev) => prev + 1);
    setSpinning(true);
    setSettled(false);
    setOutcome(null);
    setLastPayout(0);
    setLastMultiplier(0);
    setMaxRarity(null);

    const count = activeLines;
    setSettledLines(new Array(count).fill(false));

    // Start spin sound
    soundEngine.playSpin();

    try {
      const res = await api.casesSpin(activeCaseId, activeLines);
      setLinesData(res.lines);

      // Refresh balance in header
      void refreshUser();

      // Staggered reel stop durations:
      // Line 0: 2500ms
      // Line 1: 3150ms
      // Line 2: 3800ms
      const delays = [2500, 3150, 3800];

      for (let l = 0; l < count; l++) {
        const delay = delays[l] || 2500 + l * 650;
        await new Promise((resolve) => setTimeout(resolve, l === 0 ? delay : delay - delays[l - 1]));

        soundEngine.playLand();

        setSettledLines((prev) => {
          const next = [...prev];
          next[l] = true;
          return next;
        });
      }

      setLastPayout(res.totalPayout);
      setLastMultiplier(res.multiplier);
      setOutcome(res.outcome);
      setMaxRarity(res.rarity);
      setSettled(true);

      if (res.totalPayout > 0) {
        soundEngine.playWin();
      }

      void fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка подключения');
      setSettledLines(new Array(count).fill(true));
      setSettled(true);
    } finally {
      setSpinning(false);
    }
  }, [spinning, activeCaseId, activeLines, refreshUser, fetchHistory]);

  return {
    state: {
      activeCaseId,
      activeCase,
      activeLines,
      totalBet,
      maxPayout,
      spinning,
      spinId,
      settled,
      settledLines,
      linesData,
      lastPayout,
      lastMultiplier,
      outcome,
      maxRarity,
      history,
      stats,
      error,
      isContentsModalOpen,
      selectedReceiptItem,
    },
    actions: {
      setActiveCaseId,
      setActiveLines,
      spin,
      setIsContentsModalOpen,
      setSelectedReceiptItem,
      fetchHistory,
    },
  };
}
