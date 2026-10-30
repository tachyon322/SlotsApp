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
import { useUser } from './UserProvider';
import { LgSheet } from './ui/LgSheet';
import { wheelApi } from '@/lib/api';
import { showError } from '@/lib/toast';

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

// 10 секторов по 36° в точности по макету STARX
const SECTORS = [
  { prize: 10, label: '10 ₽', angle: 18, textColor: 'rgb(255, 255, 255)' },
  { prize: 20, label: '20 ₽', angle: 54, textColor: 'rgb(10, 42, 22)' },
  { prize: 25, label: '25 ₽', angle: 90, textColor: 'rgb(58, 42, 0)' },
  { prize: 50, label: '50 ₽', angle: 126, textColor: 'rgb(255, 255, 255)' },
  { prize: 100, label: '100 ₽', angle: 162, textColor: 'rgb(4, 40, 45)' },
  { prize: 200, label: '200 ₽', angle: 198, textColor: 'rgb(255, 255, 255)' },
  { prize: 500, label: '500 ₽', angle: 234, textColor: 'rgb(255, 255, 255)' },
  { prize: 1000, label: '1 000 ₽', angle: 270, textColor: 'rgb(58, 46, 0)' },
  { prize: 2500, label: '2 500 ₽', angle: 306, textColor: 'rgb(255, 255, 255)' },
  { prize: 5000, label: '5 000 ₽', angle: 342, textColor: 'rgb(255, 255, 255)' },
];

const SECTOR_ANGLE = 360 / SECTORS.length;

// Цвета секторов прежние, приглушённые под графит (42% цвета + #1B1B1B) — подписи белые.
const CONIC_GRADIENT =
  'conic-gradient(#6f293e 0deg 36deg, #2a623d 36deg 72deg, #775c1e 72deg 108deg, #43367b 108deg 144deg, #1e606a 144deg 180deg, #774123 180deg 216deg, #265374 216deg 252deg, #77691e 252deg 288deg, #51357b 288deg 324deg, #7b2953 324deg 360deg)';

const RIM_LIGHTS = 20;

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

function getTimeUntilUtcMidnight(): string {
  const now = new Date();
  const utcNow = now.getTime();
  const nextUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  ).getTime();
  const diffMs = Math.max(0, nextUtc - utcNow);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `Сброс через ${hours}ч ${minutes}м`;
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

function WheelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useUser();
  const [balance, setBalance] = useState(user?.balance ?? 0);
  const [spinsLeft, setSpinsLeft] = useState(DAILY_LIMIT);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [resetCountdown, setResetCountdown] = useState(getTimeUntilUtcMidnight());
  const spinTimerRef = useRef<number | null>(null);

  // Sync user balance when not spinning
  useEffect(() => {
    if (!spinning && user?.balance !== undefined) {
      setBalance(user.balance);
    }
  }, [user?.balance, spinning]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !spinning) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, spinning]);

  // Reset countdown interval
  useEffect(() => {
    if (!open) return;
    setResetCountdown(getTimeUntilUtcMidnight());
    const interval = setInterval(() => {
      setResetCountdown(getTimeUntilUtcMidnight());
    }, 60000);
    return () => clearInterval(interval);
  }, [open]);

  // Fetch wheel status on modal open
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setResult(null);
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
        // Fallback: balance will be read from user context
      });

    return () => {
      cancelled = true;
      if (spinTimerRef.current) {
        clearTimeout(spinTimerRef.current);
      }
    };
  }, [open]);

  const canSpin = spinsLeft > 0 && !spinning;

  const handleSpin = async () => {
    if (!canSpin) return;
    setSpinning(true);
    setResult(null);

    try {
      const res = await wheelApi.spin();
      const sectorCenter = res.sectorIndex * SECTOR_ANGLE + SECTOR_ANGLE / 2;
      const targetAngle = 360 - sectorCenter;
      const currentMod = ((rotation % 360) + 360) % 360;
      const delta = ((360 + targetAngle - currentMod) % 360) + 360 * 5;
      setRotation((prev) => prev + delta);
      setBalance(res.balance);
      setSpinsLeft(res.spinsLeft);

      spinTimerRef.current = window.setTimeout(() => {
        setSpinning(false);
        setResult(res.prize);
        void refresh();
      }, 4600);
    } catch (e) {
      setSpinning(false);
      showError((e as Error).message || 'Не удалось крутить колесо');
    }
  };

  const handleSpinAgain = () => {
    setResult(null);
    setTimeout(() => {
      void handleSpin();
    }, 150);
  };

  const handleCloseClick = () => {
    if (!spinning) {
      onClose();
    }
  };

  const celebrationStyle = useMemo(() => {
    if (!result) return 'standard';
    if (result >= 1000) return 'premium';
    if (result >= 200) return 'enhanced';
    return 'standard';
  }, [result]);

  if (!open) return null;

  const spinsWord = `${spinsLeft} ${pluralSpins(spinsLeft)}`;

  let footer: ReactNode;
  if (result !== null) {
    footer =
      spinsLeft > 0 ? (
        <>
          <button type="button" className="pg-btn pg-btn-sec ls-fit" onClick={() => setResult(null)}>
            Забрать
          </button>
          <button type="button" className="pg-btn pg-btn-acc" onClick={handleSpinAgain}>
            Крутить ещё
          </button>
        </>
      ) : (
        <button type="button" className="pg-btn pg-btn-acc" onClick={() => setResult(null)}>
          Отлично
        </button>
      );
  } else if (spinning) {
    footer = (
      <button type="button" className="pg-btn pg-btn-acc" disabled>
        <span className="pg-spin" />
        Колесо вращается...
      </button>
    );
  } else if (spinsLeft > 0) {
    footer = (
      <button type="button" className="pg-btn pg-btn-acc" onClick={handleSpin}>
        Крутить бесплатно
      </button>
    );
  } else {
    footer = (
      <button type="button" className="pg-btn pg-btn-wait" disabled>
        {resetCountdown.replace('Сброс через', 'Новые спины через')}
      </button>
    );
  }

  return (
    <LgSheet
      titleId="web-wheel-dialog-title"
      title="Колесо наград"
      onClose={handleCloseClick}
      closeDisabled={spinning}
      state={spinning ? 'spinning' : result !== null ? 'result' : 'idle'}
      footer={footer}
    >
      <div className="ls-whud">
        <div>
          <small>Баланс</small>
          <b>{formatRub(balance)}</b>
        </div>
        <div>
          <small>Спины сегодня</small>
          <b>
            {spinsLeft}/{DAILY_LIMIT}
            <em>{resetCountdown.replace('Сброс через ', 'сброс ')}</em>
          </b>
        </div>
      </div>

      <div
        className="ls-wheel"
        data-spinning={spinning}
        data-empty={!spinning && result === null && spinsLeft <= 0}
        data-celebration={result !== null ? celebrationStyle : undefined}
      >
        <span className="ls-wheel-rim" aria-hidden="true" />
        <span className="ls-wheel-lights" aria-hidden="true">
          {Array.from({ length: RIM_LIGHTS }, (_, i) => (
            <i key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </span>
        <div
          className="ls-wheel-dial"
          role="region"
          aria-label="Секторы колеса"
          style={{
            backgroundImage: CONIC_GRADIENT,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 4.5s cubic-bezier(0.12, 0.72, 0.12, 1)' : 'none',
          }}
        >
          {SECTORS.map((sector, i) => (
            <span key={`line-${sector.prize}`} className="ls-wheel-line" style={{ transform: `rotate(${i * SECTOR_ANGLE}deg)` }} />
          ))}
          {SECTORS.map((sector) => (
            <div key={sector.prize} className="ls-wheel-label" style={{ transform: `rotate(${sector.angle}deg)` }}>
              <span>{sector.label}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="ls-wheel-hub"
          aria-label="Вращать колесо"
          onClick={handleSpin}
          disabled={!canSpin}
        >
          КРУТИТЬ
        </button>
        <svg className="ls-wheel-ptr" viewBox="0 0 28 36" aria-hidden="true">
          <path d="M14 35 2 9a12 12 0 1 1 24 0z" />
          <circle cx="14" cy="12" r="4" />
        </svg>
      </div>

      <div className="ls-wstat" aria-live="polite">
        {result !== null ? (
          <>
            <b data-tone="pos">+{formatRub(result)} — поздравляем!</b>
            <span>
              Баланс: {formatRub(balance)} ·{' '}
              {spinsLeft > 0 ? `осталось спинов: ${spinsLeft}` : 'все спины на сегодня использованы'}
            </span>
          </>
        ) : spinning ? (
          <>
            <b>Колесо вращается...</b>
            <span>Удачи! Пусть выпадет максимальный приз!</span>
          </>
        ) : spinsLeft > 0 ? (
          <>
            <b>Осталось {spinsWord}</b>
            <span>Крутите колесо и выигрывайте реальные рубли</span>
          </>
        ) : (
          <>
            <b>Спины на сегодня исчерпаны</b>
            <span>Новые спины начисляются каждый день в 00:00 UTC</span>
          </>
        )}
      </div>
    </LgSheet>
  );
}
