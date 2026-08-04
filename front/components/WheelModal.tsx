'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { useUser } from './UserProvider';
import { wheelApi } from '@/lib/api';

interface WheelModalContextValue {
  openWheel: () => void;
}

const WheelModalContext = createContext<WheelModalContextValue>({
  openWheel: () => {},
});

export function useWheelModal() {
  return useContext(WheelModalContext);
}

const DAILY_LIMIT = 3;

// 10 секторов по 36° (цвета из макета)
const SECTORS = [
  { prize: 10, color: 'rgb(226,61,110)', textColor: '#ffffff' },
  { prize: 20, color: 'rgb(62,196,109)', textColor: 'rgb(10,42,22)' },
  { prize: 25, color: 'rgb(245,181,33)', textColor: 'rgb(58,42,0)' },
  { prize: 50, color: 'rgb(122,92,255)', textColor: '#ffffff' },
  { prize: 100, color: 'rgb(33,192,214)', textColor: 'rgb(4,40,45)' },
  { prize: 200, color: 'rgb(245,118,47)', textColor: '#ffffff' },
  { prize: 500, color: 'rgb(52,160,240)', textColor: '#ffffff' },
  { prize: 1000, color: 'rgb(245,212,35)', textColor: 'rgb(58,46,0)' },
  { prize: 2500, color: 'rgb(155,89,255)', textColor: '#ffffff' },
  { prize: 5000, color: 'rgb(255,61,160)', textColor: '#ffffff' },
];

const SECTOR_ANGLE = 360 / SECTORS.length;

function conicGradient(): string {
  const stops: string[] = [];
  for (let i = 0; i < SECTORS.length; i++) {
    const from = i * SECTOR_ANGLE;
    const to = (i + 1) * SECTOR_ANGLE;
    stops.push(`${SECTORS[i].color} ${from}deg`, `${SECTORS[i].color} ${to}deg`);
  }
  return `conic-gradient(${stops.join(', ')})`;
}

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function pluralSpins(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'спинов';
  if (last > 1 && last < 5) return 'спина';
  if (last === 1) return 'спин';
  return 'спинов';
}

export function WheelModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openWheel = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const contextValue = useMemo<WheelModalContextValue>(
    () => ({ openWheel }),
    [openWheel],
  );

  return (
    <WheelModalContext.Provider value={contextValue}>
      {children}
      <WheelModal open={open} onClose={close} />
    </WheelModalContext.Provider>
  );
}

const WHEEL_SIZE = 288; // px, w-72
const LABEL_RADIUS = WHEEL_SIZE / 2 - 34;

function WheelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useUser();
  const [balance, setBalance] = useState(user?.balance ?? 0);
  const [spinsLeft, setSpinsLeft] = useState(DAILY_LIMIT);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setResult(null);
    setError(null);
    setSpinning(false);
    setRotation(Math.floor(Math.random() * 360));

    wheelApi
      .status()
      .then((s) => {
        if (cancelled) return;
        setBalance(s.balance);
        setSpinsLeft(s.spinsLeft);
      })
      .catch(() => {
        // Игнорируем: статус подтянется из user при закрытии/открытии
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const canSpin = spinsLeft > 0 && !spinning;

  const handleSpin = async () => {
    if (!canSpin) return;
    setSpinning(true);
    setResult(null);
    setError(null);

    try {
      const res = await wheelApi.spin();
      const sectorCenter = res.sectorIndex * SECTOR_ANGLE + SECTOR_ANGLE / 2;
      const targetAngle = 360 - sectorCenter;
      const currentMod = ((rotation % 360) + 360) % 360;
      const delta = ((360 + targetAngle - currentMod) % 360) + 360 * 5;
      setRotation((prev) => prev + delta);
      setBalance(res.balance);
      setSpinsLeft(res.spinsLeft);

      window.setTimeout(() => {
        setSpinning(false);
        setResult(res.prize);
        void refresh();
      }, 4600);
    } catch (e) {
      setSpinning(false);
      setError((e as Error).message || 'Не удалось крутить колесо');
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      titleId="wheel-modal-title"
      maxWidthClass="max-w-[28rem]"
    >
      <div className="flex flex-col items-center gap-lg">
        <div className="text-center">
          <div className="mx-auto mb-sm p-sm rounded-pill bg-gradient-to-r from-fuchsia-500/10 to-amber-500/10 w-fit">
            <Sparkles className="w-7 h-7 text-amber-400" />
          </div>
          <h2
            id="wheel-modal-title"
            className="text-xl font-bold text-white"
          >
            Колесо Фортуны
          </h2>
          <p className="text-sm text-zinc-400 mt-2xs">
            Крути каждый день и забирай денежные призы
          </p>
        </div>

        {/* Пилюли */}
        <div className="flex gap-xs w-full max-w-[320px]">
          <div className="flex-1 flex flex-col items-center gap-2xs py-sm rounded-button bg-white/[0.03] border border-white/10">
            <span className="text-[11px] text-zinc-400 font-semibold">Баланс</span>
            <span className="text-base font-bold text-white tabular-nums">
              {formatRub(balance)}
            </span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2xs py-sm rounded-button bg-white/[0.03] border border-white/10">
            <span className="text-[11px] text-zinc-400 font-semibold">Крутки</span>
            <span className="text-base font-bold text-white tabular-nums">
              {spinsLeft}/{DAILY_LIMIT}
            </span>
          </div>
        </div>

        {/* Колесо */}
        <div className="relative" style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}>
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 z-20 w-0 h-0"
            style={{
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: '22px solid #f8fafc',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            }}
            aria-hidden="true"
          />
          <div
            className="w-full h-full rounded-pill border-[6px] border-white/90 shadow-2xl shadow-black/50"
            style={{
              backgroundImage: conicGradient(),
              transform: `rotate(${rotation}deg)`,
              transition: spinning
                ? 'transform 4.5s cubic-bezier(0.12, 0.72, 0.12, 1)'
                : 'none',
            }}
            role="img"
            aria-label="Колесо фортуны"
          >
            {SECTORS.map((sector, i) => {
              const angle = i * SECTOR_ANGLE + SECTOR_ANGLE / 2;
              return (
                <span
                  key={sector.prize}
                  className="absolute left-1/2 top-1/2 block"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(${-LABEL_RADIUS}px) rotate(${-angle}deg)`,
                  }}
                >
                  <span
                    className="block text-sm font-bold drop-shadow-sm whitespace-nowrap"
                    style={{ color: sector.textColor }}
                  >
                    {sector.prize.toLocaleString('ru-RU')} ₽
                  </span>
                </span>
              );
            })}
          </div>

          {/* Кнопка по центру */}
          <button
            type="button"
            onClick={handleSpin}
            disabled={!canSpin}
            aria-label="Вращать колесо"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 h-16 w-16 rounded-pill bg-zinc-900 border-4 border-white/90 text-[13px] font-extrabold tracking-wider text-white shadow-xl shadow-black/40 transition-all hover:brightness-125 active:scale-95 disabled:opacity-60 disabled:hover:brightness-100"
          >
            ВРАЩАТЬ
          </button>
        </div>

        {result !== null && (
          <div className="w-full max-w-[320px] flex items-center justify-center gap-xs py-sm rounded-button bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-400/30">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-bold text-white">
              Вы выиграли {formatRub(result)}!
            </span>
          </div>
        )}

        {error && (
          <div className="w-full max-w-[320px] text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-button px-sm py-xs text-center">
            {error}
          </div>
        )}

        <p className="text-xs text-zinc-500 text-center -mt-2xs">
          {spinsLeft > 0
            ? `Осталось ${spinsLeft} ${pluralSpins(spinsLeft)} — крути и забирай приз!`
            : 'Спины на сегодня закончились — возвращайся завтра!'}
        </p>
      </div>
    </ModalShell>
  );
}
