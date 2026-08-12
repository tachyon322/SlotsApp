'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import {
  getCountdownParts,
  formatCountdown,
  isContestParticipated,
  setContestParticipated,
} from '@/lib/contest';
import { useUser } from './UserProvider';
import { useAuthModal } from './AuthModal';
import { walletApi } from '@/lib/api';
import { showError } from '@/lib/toast';

interface ContestModalContextValue {
  openContest: () => void;
}

const ContestModalContext = createContext<ContestModalContextValue>({
  openContest: () => {},
});

export function useContestModal() {
  return useContext(ContestModalContext);
}

export function ContestModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openContest = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const contextValue = useMemo<ContestModalContextValue>(
    () => ({ openContest }),
    [openContest],
  );

  return (
    <ContestModalContext.Provider value={contextValue}>
      {children}
      <ContestModal open={open} onClose={close} />
    </ContestModalContext.Provider>
  );
}

const PRIZES = [
  {
    title: 'iPhone 17 Pro Max 1TB',
    description: 'Оранжевый iPhone 17 Pro Max',
    winners: '5 Победителей',
    image: '/img/contest/iphone.png',
    imageClass: 'right-4 h-[195px] translate-y-[-22%] min-[390px]:right-6 min-[390px]:h-[218px]',
    glow: 'bg-orange-300/32',
    overlay: 'from-orange-500/30 via-blue-900/45 to-[#07131d]',
  },
  {
    title: 'Apple Watch Ultra',
    description: 'Умные часы для активных игроков',
    winners: '5 Победителей',
    image: '/img/contest/appleWatch.png',
    imageClass: 'right-2 h-[90px] translate-y-[-49%] min-[390px]:right-3 min-[390px]:h-[101px]',
    glow: 'bg-slate-200/28',
    overlay: 'from-slate-300/22 via-slate-700/38 to-[#07131d]',
  },
  {
    title: 'AirPods Pro 3',
    description: 'Беспроводные наушники Apple',
    winners: '10 Победителей',
    image: '/img/contest/airPods.png',
    imageClass: 'right-5 h-[74px] translate-y-[-50%] min-[390px]:right-6 min-[390px]:h-[83px]',
    glow: 'bg-sky-200/30',
    overlay: 'from-sky-300/22 via-blue-800/38 to-[#07131d]',
  },
  {
    title: '500 000 ₽',
    description: '10 призовых мест по 50 000 ₽',
    winners: '10 призовых мест',
    image: '/img/contest/money.png',
    imageClass: 'right-2 h-[63px] translate-y-[-50%] min-[390px]:right-3 min-[390px]:h-[72px]',
    glow: 'bg-emerald-300/30',
    overlay: 'from-emerald-400/24 via-cyan-800/34 to-[#07131d]',
  },
];

function ContestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const { openAuth } = useAuthModal();
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const scrollYRef = useRef(0);
  const bodyLockedRef = useRef(false);
  const [now, setNow] = useState(() => new Date());
  const [participated, setParticipated] = useState(() => isContestParticipated());
  const [hasDeposit, setHasDeposit] = useState(false);
  const [depositCheckPending, setDepositCheckPending] = useState(false);

  useEffect(() => {
    if (!open || !user) {
      setHasDeposit(false);
      return;
    }
    let cancelled = false;
    setDepositCheckPending(true);
    walletApi
      .eligibility()
      .then((res) => {
        if (!cancelled) setHasDeposit(res.hasDeposit);
      })
      .catch(() => {
        if (!cancelled) setHasDeposit(false);
      })
      .finally(() => {
        if (!cancelled) setDepositCheckPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const handleParticipate = () => {
    if (!user) {
      openAuth('signin');
      return;
    }
    if (depositCheckPending) return;
    if (!hasDeposit) {
      showError('Для участия в конкурсе совершите хотя бы один депозит');
      return;
    }
    setContestParticipated();
    setParticipated(true);
  };

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setNow(new Date());
      setParticipated(isContestParticipated());
      if (!bodyLockedRef.current) {
        scrollYRef.current = window.scrollY;
        const style = document.body.style;
        style.position = 'fixed';
        style.top = `-${scrollYRef.current}px`;
        style.left = '0';
        style.right = '0';
        style.width = '100%';
        style.overflow = 'hidden';
        bodyLockedRef.current = true;
      }
    } else {
      setClosing(true);
      const timer = setTimeout(() => {
        setMounted(false);
        setClosing(false);
        if (bodyLockedRef.current) {
          const style = document.body.style;
          style.position = '';
          style.top = '';
          style.left = '';
          style.right = '';
          style.width = '';
          style.overflow = '';
          window.scrollTo(0, scrollYRef.current);
          bodyLockedRef.current = false;
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!mounted) return null;

  const countdown = formatCountdown(getCountdownParts(now));

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="flex min-h-dvh items-end justify-center md:items-center md:p-md">
        <div
          className={`fixed inset-0 bg-black/70 will-change-[opacity] ${
            closing
              ? 'animate-[modal-backdrop-out_0.2s_cubic-bezier(0.4,0,1,1)_both]'
              : 'animate-[modal-backdrop-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]'
          }`}
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contest-modal-title"
          className={`relative w-full overflow-hidden border border-white/10 bg-[#07131d] text-white shadow-2xl h-[78dvh] rounded-t-3xl md:h-auto md:max-h-[calc(100dvh-2rem)] md:max-w-[28rem] md:rounded-3xl will-change-[transform,opacity] ${
            closing
              ? 'animate-[sheet-out_0.2s_cubic-bezier(0.4,0,1,1)_both] md:animate-[modal-panel-out_0.2s_cubic-bezier(0.4,0,1,1)_both]'
              : 'animate-[sheet-in_0.3s_cubic-bezier(0.16,1,0.3,1)_both] md:animate-[modal-panel-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]'
          }`}
        >
          <div className="absolute right-3 top-3 z-30">
            <button
              type="button"
              aria-label="Закрыть конкурс"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white/80 backdrop-blur transition hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-full md:max-h-[calc(100dvh-2rem)] overflow-y-auto scrollbar-hide">
            {/* Шапка */}
            <div className="relative h-48 overflow-hidden">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(circle at 20% 20%, rgba(45, 212, 191, 0.35), transparent 28%), radial-gradient(circle at 82% 24%, rgba(59, 130, 246, 0.38), transparent 28%), linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(15, 23, 42, 0.82))',
                }}
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#07131d] via-[#07131d]/82 to-transparent" />

              <div className="absolute left-4 top-4 z-20 inline-flex h-8 items-center rounded-full border border-white/15 bg-black/28 px-3 text-[11px] font-semibold leading-none text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-md min-[390px]:left-5 min-[390px]:top-5 min-[390px]:h-9 min-[390px]:px-3.5 min-[390px]:text-xs">
                <span className="whitespace-nowrap">До итогов:&nbsp;</span>
                <span className="whitespace-nowrap font-bold tabular-nums">{countdown}</span>
              </div>

              <div className="relative z-10 flex h-full flex-col justify-end p-5">
                <h2 id="contest-modal-title" className="text-2xl font-black leading-tight">
                  Конкурс недели
                </h2>
                <p className="mt-1 text-sm leading-5 text-white/72">
                  Участвуйте в розыгрыше призов и выиграйте iPhone 17 Pro Max, Apple Watch и
                  денежные призы
                </p>
              </div>
            </div>

            {/* Призы */}
            <div className="space-y-4 px-5 pb-5">
              {PRIZES.map((prize) => (
                <div
                  key={prize.title}
                  className="relative min-h-[104px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-3.5 pr-[104px] shadow-[0_16px_34px_rgba(0,0,0,0.28)] min-[390px]:min-h-[112px] min-[390px]:p-4 min-[390px]:pr-[132px] from-[#1d2038] via-[#102341] to-[#07131d]"
                >
                  <div className="relative z-10 min-w-0">
                    <h3 className="max-w-[190px] text-[13px] font-black leading-[1.16] text-white min-[390px]:max-w-[230px] min-[390px]:text-[15px]">
                      {prize.title}
                    </h3>
                    <p className="mt-1 max-w-[175px] text-[11px] font-medium leading-4 text-white/64 min-[390px]:max-w-[220px] min-[390px]:text-xs">
                      {prize.description}
                    </p>
                    <div className="mt-2 inline-flex h-6 items-center rounded-full border border-white/30 bg-white px-2.5 text-[10px] font-medium text-slate-950 shadow-sm min-[390px]:h-7 min-[390px]:text-[11px]">
                      {prize.winners}
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-y-0 right-0 w-[116px] overflow-hidden min-[390px]:w-[142px]">
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${prize.overlay}`}
                    />
                    <div className="absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#0f1d2d]/95 via-[#0f1d2d]/70 to-transparent min-[390px]:w-16" />
                    <div
                      className={`absolute -right-7 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full blur-2xl min-[390px]:-right-8 min-[390px]:h-32 min-[390px]:w-32 ${prize.glow}`}
                    />
                    <img
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className={`absolute top-1/2 z-[12] w-auto scale-[1.08] select-none object-contain opacity-[0.46] blur-[14px] saturate-150 brightness-125 ${prize.imageClass}`}
                      src={prize.image}
                    />
                    <img
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className={`absolute top-1/2 z-20 w-auto select-none object-contain drop-shadow-[0_16px_24px_rgba(0,0,0,0.42)] ${prize.imageClass}`}
                      src={prize.image}
                    />
                  </div>
                </div>
              ))}

              {participated ? (
                <div className="flex w-full items-center gap-3 rounded-xl border border-money/30 bg-money/10 px-4 py-3">
                  <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-money" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">Вы участвуете</p>
                    <p className="text-xs text-white/60">
                      Вы в игре, ждём итоги конкурса
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleParticipate}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-center text-base font-black text-white shadow-lg shadow-blue-500/25 transition-colors hover:from-blue-600 hover:to-blue-700"
                >
                  Участвовать
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
