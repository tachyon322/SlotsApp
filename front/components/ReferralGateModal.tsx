'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { CircleCheckBig, Users } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { ReferralInvitePanel } from './referral/ReferralInvitePanel';
import { referralApi, type ReferralsStatusResponse } from '@/lib/api';

const REQUIRED_REFERRALS = 3;
const POLL_INTERVAL_MS = 10000;

interface ReferralGateContextValue {
  openReferralGate: () => Promise<boolean>;
}

const ReferralGateContext = createContext<ReferralGateContextValue>({
  openReferralGate: async () => false,
});

export function useReferralGate() {
  return useContext(ReferralGateContext);
}

export function ReferralGateModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const openReferralGate = useCallback(() => {
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setOpen(false);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    if (resolve) resolve(ok);
  }, []);

  const contextValue = useMemo<ReferralGateContextValue>(
    () => ({ openReferralGate }),
    [openReferralGate],
  );

  return (
    <ReferralGateContext.Provider value={contextValue}>
      {children}
      <ReferralGateModal open={open} onClose={() => close(false)} onDone={() => close(true)} />
    </ReferralGateContext.Provider>
  );
}

function ReferralGateModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<ReferralsStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [passed, setPassed] = useState(false);

  const load = useCallback(async (): Promise<ReferralsStatusResponse | null> => {
    try {
      const data = await referralApi.status();
      setStatus(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPassed(false);
    setLoading(true);

    void load()
      .then((data) => {
        if (!cancelled && data && data.friendsCount >= REQUIRED_REFERRALS) setPassed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const interval = setInterval(() => {
      void load().then((data) => {
        if (!cancelled && data && data.friendsCount >= REQUIRED_REFERRALS) setPassed(true);
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, load]);

  useEffect(() => {
    if (!open || !passed) return;
    window.dispatchEvent(new CustomEvent('referrals-paid'));
    window.dispatchEvent(new CustomEvent('gate-paid'));
  }, [open, passed]);

  if (passed) {
    return (
      <ModalShell open={open} onClose={onDone} titleId="referral-gate-title" zIndexClass="z-[150]">
        <div className="flex flex-col items-center text-center gap-md animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CircleCheckBig className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="space-y-xs">
            <h2 id="referral-gate-title" className="text-2xl font-bold text-white">
              Друзья приглашены!
            </h2>
            <p className="text-sm text-zinc-400">
              Все {REQUIRED_REFERRALS} друга зарегистрированы по вашей ссылке. Вывод средств открыт
            </p>
          </div>
          <button
            onClick={onDone}
            className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
          >
            Продолжить
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell open={open} onClose={onClose} titleId="referral-gate-title" maxWidthClass="max-w-[30rem]" zIndexClass="z-[150]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-panel border border-blue-500/30 bg-blue-500/15 text-blue-400">
            <Users className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 id="referral-gate-title" className="text-lg font-bold text-white">
              Шаг 4/4 · Пригласите {REQUIRED_REFERRALS} друзей
            </h2>
            <p className="text-xs text-muted-foreground">
              Последний шаг — без него вывод средств недоступен
            </p>
          </div>
        </div>

        <ReferralInvitePanel
          status={status}
          loading={loading}
          progress={{ current: status?.friendsCount ?? 0, target: REQUIRED_REFERRALS }}
        />

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
        >
          Позже
        </button>
      </div>
    </ModalShell>
  );
}
