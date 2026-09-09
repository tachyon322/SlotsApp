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

// 10 секторов по 36° в точности по макету LitGame
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

const CONIC_GRADIENT =
  'conic-gradient(rgb(226, 61, 110) 0deg 36deg, rgb(62, 196, 109) 36deg 72deg, rgb(245, 181, 33) 72deg 108deg, rgb(122, 92, 255) 108deg 144deg, rgb(33, 192, 214) 144deg 180deg, rgb(245, 118, 47) 180deg 216deg, rgb(52, 160, 240) 216deg 252deg, rgb(245, 212, 35) 252deg 288deg, rgb(155, 89, 255) 288deg 324deg, rgb(255, 61, 160) 324deg 360deg)';

const CELEBRATION_SPARKS = [
  { angle: '0deg', distance: '140px', delay: '0.05s' },
  { angle: '30deg', distance: '155px', delay: '0.12s' },
  { angle: '60deg', distance: '135px', delay: '0.08s' },
  { angle: '90deg', distance: '160px', delay: '0.15s' },
  { angle: '120deg', distance: '145px', delay: '0.06s' },
  { angle: '150deg', distance: '155px', delay: '0.18s' },
  { angle: '180deg', distance: '140px', delay: '0.10s' },
  { angle: '210deg', distance: '150px', delay: '0.14s' },
  { angle: '240deg', distance: '135px', delay: '0.07s' },
  { angle: '270deg', distance: '160px', delay: '0.16s' },
  { angle: '300deg', distance: '145px', delay: '0.09s' },
  { angle: '330deg', distance: '155px', delay: '0.13s' },
];

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

  const handleBackdropClick = () => {
    if (!spinning) {
      onClose();
    }
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

  return (
    <div
      className="web-dialog_overlay__MnStH"
      data-web-dialog-frame="web-dialog-wheel"
      data-web-dialog-size="wide"
      data-web-dialog-mobile="detached"
      data-web-dialog-placement="center"
      data-web-dialog-topmost="true"
      data-close-blocked={spinning ? 'true' : 'false'}
      style={
        {
          '--web-dialog-stack-index': 0,
          '--web-dialog-viewport-height': '100dvh',
          '--web-dialog-viewport-width': '100vw',
          '--web-dialog-viewport-top': '0px',
          '--web-dialog-viewport-left': '0px',
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className="web-dialog_backdrop__hf_yN"
        data-web-dialog-backdrop="true"
        aria-hidden="true"
        tabIndex={-1}
        onClick={handleBackdropClick}
      />
      <section
        className="web-dialog_panel__ZC8Km"
        role="dialog"
        aria-labelledby="web-wheel-dialog-title"
        tabIndex={-1}
        data-web-dialog-panel="true"
        data-web-dialog-asset="wheel"
        data-web-dialog-asset-phase="ready"
        aria-modal="true"
      >
        <div className="web-dialog_chrome__jivZf" data-web-dialog-chrome="true">
          <button
            type="button"
            className="web-dialog_close__DPjMy"
            aria-label="Закрыть"
            onClick={handleCloseClick}
            disabled={spinning}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m6.75 6.75 10.5 10.5m0-10.5-10.5 10.5" />
            </svg>
          </button>
        </div>
        <div
          className="web-dialog_scroll__AcpCy"
          data-web-dialog-scroll-region="true"
          tabIndex={0}
        >
          <h2 id="web-wheel-dialog-title" className="wheel_srOnly__ZE2Ca">
            Колесо фортуны Litgame
          </h2>
          <section
            className="wheel_sheet__YIg9d wheel_webSheet__HjSdS"
            aria-label="Колесо фортуны"
            data-wheel-surface-mode="web"
          >
            <div className="wheel_dialogStage__7u13H">
              <div className="wheel_dialogContent__w3k9e">
                {/* HUD DOCK */}
                <aside className="wheel_hudDock__2xIbF" aria-label="Статус колеса">
                  <div className="wheel_pills__GCQ3n">
                    <div className="wheel_pill__QR8lf">
                      <span className="wheel_pillLabel__H11NH">Баланс</span>
                      <span className="wheel_pillValue__bqybA">
                        {formatRub(balance)}
                      </span>
                    </div>
                    <div className="wheel_pill__QR8lf">
                      <span className="wheel_pillLabel__H11NH">Спины</span>
                      <span className="wheel_pillValue__bqybA">
                        {spinsLeft}/{DAILY_LIMIT}
                      </span>
                      <span className="wheel_pillMeta__SSv77">
                        {resetCountdown}
                      </span>
                    </div>
                  </div>
                </aside>

                {/* MACHINE FRAME */}
                <div
                  className="wheel_machineFrame__98Elk"
                  data-wheel-machine-family="wide"
                >
                  {/* AMBIENT GLOW */}
                  <picture
                    className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h wheel_machineAmbientAsset__IF_QB"
                    style={
                      {
                        '--web-hub-asset-aspect': '960 / 640',
                        '--web-hub-asset-position': '50% 50%',
                      } as React.CSSProperties
                    }
                    data-web-hub-runtime-version="v1"
                    data-web-hub-asset="wheel-ambient-glow"
                    data-asset-family-id="wheel"
                    data-web-hub-placement="wheel-ambient-glow"
                    data-web-hub-fit="contain"
                    data-web-hub-activation-policy="immediate"
                    data-web-hub-viewport-intersection="not_observed"
                    data-web-hub-observer-state="not_applicable"
                    data-web-hub-observer-settled="not_applicable"
                    data-web-hub-activation-state="true"
                    data-web-hub-picture-mounted="true"
                    data-web-hub-network-picture="true"
                    data-web-hub-candidate-widths="640,960,1440"
                    aria-hidden="true"
                  >
                    <source
                      type="image/avif"
                      srcSet="/images/web-hub/v1/modals/wheel/wheel-ambient-glow-640w.avif 640w, /images/web-hub/v1/modals/wheel/wheel-ambient-glow-960w.avif 960w, /images/web-hub/v1/modals/wheel/wheel-ambient-glow-1440w.avif 1440w"
                      sizes="(max-width: 767px) 96vw, (max-width: 1100px) 74vw, 760px"
                    />
                    <source
                      type="image/webp"
                      srcSet="/images/web-hub/v1/modals/wheel/wheel-ambient-glow-640w.webp 640w, /images/web-hub/v1/modals/wheel/wheel-ambient-glow-960w.webp 960w, /images/web-hub/v1/modals/wheel/wheel-ambient-glow-1440w.webp 1440w"
                      sizes="(max-width: 767px) 96vw, (max-width: 1100px) 74vw, 760px"
                    />
                    <img
                      className="web-hub-runtime-picture_image__63vQy"
                      width="960"
                      height="640"
                      sizes="(max-width: 767px) 96vw, (max-width: 1100px) 74vw, 760px"
                      alt=""
                      aria-hidden="true"
                      loading="eager"
                      decoding="async"
                      fetchPriority="auto"
                      draggable="false"
                      src="/images/web-hub/v1/modals/wheel/wheel-ambient-glow-960w.webp"
                    />
                  </picture>

                  {/* PEDESTAL */}
                  <picture
                    className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h wheel_machinePedestalAsset__gOZzK"
                    style={
                      {
                        '--web-hub-asset-aspect': '880 / 320',
                        '--web-hub-asset-position': '50% 50%',
                      } as React.CSSProperties
                    }
                    data-web-hub-runtime-version="v1"
                    data-web-hub-asset="wheel-pedestal-wide"
                    data-asset-family-id="wheel"
                    data-web-hub-placement="wheel-pedestal-wide"
                    data-web-hub-fit="contain"
                    data-web-hub-activation-policy="immediate"
                    data-web-hub-viewport-intersection="not_observed"
                    data-web-hub-observer-state="not_applicable"
                    data-web-hub-observer-settled="not_applicable"
                    data-web-hub-activation-state="true"
                    data-web-hub-picture-mounted="true"
                    data-web-hub-network-picture="true"
                    data-web-hub-candidate-widths="640,880,1440"
                    aria-hidden="true"
                  >
                    <source
                      type="image/avif"
                      srcSet="/images/web-hub/v1/modals/wheel/wheel-pedestal-wide-640w.avif 640w, /images/web-hub/v1/modals/wheel/wheel-pedestal-wide-880w.avif 880w, /images/web-hub/v1/modals/wheel/wheel-pedestal-wide-1440w.avif 1440w"
                      sizes="(max-width: 767px) 92vw, (max-width: 1100px) 68vw, 720px"
                    />
                    <source
                      type="image/webp"
                      srcSet="/images/web-hub/v1/modals/wheel/wheel-pedestal-wide-640w.webp 640w, /images/web-hub/v1/modals/wheel/wheel-pedestal-wide-880w.webp 880w, /images/web-hub/v1/modals/wheel/wheel-pedestal-wide-1440w.webp 1440w"
                      sizes="(max-width: 767px) 92vw, (max-width: 1100px) 68vw, 720px"
                    />
                    <img
                      className="web-hub-runtime-picture_image__63vQy"
                      width="880"
                      height="320"
                      sizes="(max-width: 767px) 92vw, (max-width: 1100px) 68vw, 720px"
                      alt=""
                      aria-hidden="true"
                      loading="eager"
                      decoding="async"
                      fetchPriority="auto"
                      draggable="false"
                      src="/images/web-hub/v1/modals/wheel/wheel-pedestal-wide-880w.webp"
                    />
                  </picture>

                  {/* DIAL WRAP */}
                  <div
                    className="wheel_dialWrap__etMUB"
                    role="region"
                    aria-label="Секторы колеса"
                    aria-live="polite"
                  >
                    {/* FRAME */}
                    <picture
                      className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h wheel_wheelFrameAsset__LGWi6"
                      style={
                        {
                          '--web-hub-asset-aspect': '720 / 720',
                          '--web-hub-asset-position': '50% 50%',
                        } as React.CSSProperties
                      }
                      data-web-hub-runtime-version="v1"
                      data-web-hub-asset="wheel-frame"
                      data-asset-family-id="wheel"
                      data-web-hub-placement="wheel-frame"
                      data-web-hub-fit="contain"
                      data-web-hub-activation-policy="immediate"
                      data-web-hub-viewport-intersection="not_observed"
                      data-web-hub-observer-state="not_applicable"
                      data-web-hub-observer-settled="not_applicable"
                      data-web-hub-activation-state="true"
                      data-web-hub-picture-mounted="true"
                      data-web-hub-network-picture="true"
                      data-web-hub-candidate-widths="320,480,640,960"
                      aria-hidden="true"
                    >
                      <source
                        type="image/avif"
                        srcSet="/images/web-hub/v1/modals/wheel/wheel-frame-320w.avif 320w, /images/web-hub/v1/modals/wheel/wheel-frame-480w.avif 480w, /images/web-hub/v1/modals/wheel/wheel-frame-640w.avif 640w, /images/web-hub/v1/modals/wheel/wheel-frame-960w.avif 960w"
                        sizes="(max-width: 767px) min(114vw, 510px), clamp(585px, 68vw, 717px)"
                      />
                      <source
                        type="image/webp"
                        srcSet="/images/web-hub/v1/modals/wheel/wheel-frame-320w.webp 320w, /images/web-hub/v1/modals/wheel/wheel-frame-480w.webp 480w, /images/web-hub/v1/modals/wheel/wheel-frame-640w.webp 640w, /images/web-hub/v1/modals/wheel/wheel-frame-960w.webp 960w"
                        sizes="(max-width: 767px) min(114vw, 510px), clamp(585px, 68vw, 717px)"
                      />
                      <img
                        className="web-hub-runtime-picture_image__63vQy"
                        width="720"
                        height="720"
                        sizes="(max-width: 767px) min(114vw, 510px), clamp(585px, 68vw, 717px)"
                        alt=""
                        aria-hidden="true"
                        loading="eager"
                        decoding="async"
                        fetchPriority="auto"
                        draggable="false"
                        src="/images/web-hub/v1/modals/wheel/wheel-frame-640w.webp"
                      />
                    </picture>

                    {/* POINTER ASSET */}
                    <picture
                      className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h wheel_wheelPointerAsset__p5fur"
                      style={
                        {
                          '--web-hub-asset-aspect': '240 / 320',
                          '--web-hub-asset-position': '50% 50%',
                        } as React.CSSProperties
                      }
                      data-web-hub-runtime-version="v1"
                      data-web-hub-asset="wheel-pointer"
                      data-asset-family-id="wheel"
                      data-web-hub-placement="wheel-pointer"
                      data-web-hub-fit="contain"
                      data-web-hub-activation-policy="immediate"
                      data-web-hub-viewport-intersection="not_observed"
                      data-web-hub-observer-state="not_applicable"
                      data-web-hub-observer-settled="not_applicable"
                      data-web-hub-activation-state="true"
                      data-web-hub-picture-mounted="true"
                      data-web-hub-network-picture="true"
                      data-web-hub-candidate-widths="240,320,480"
                      aria-hidden="true"
                    >
                      <source
                        type="image/avif"
                        srcSet="/images/web-hub/v1/modals/wheel/wheel-pointer-240w.avif 240w, /images/web-hub/v1/modals/wheel/wheel-pointer-320w.avif 320w, /images/web-hub/v1/modals/wheel/wheel-pointer-480w.avif 480w"
                        sizes="(max-width: 767px) min(14vw, 61px), clamp(70px, 8vw, 86px)"
                      />
                      <source
                        type="image/webp"
                        srcSet="/images/web-hub/v1/modals/wheel/wheel-pointer-240w.webp 240w, /images/web-hub/v1/modals/wheel/wheel-pointer-320w.webp 320w, /images/web-hub/v1/modals/wheel/wheel-pointer-480w.webp 480w"
                        sizes="(max-width: 767px) min(14vw, 61px), clamp(70px, 8vw, 86px)"
                      />
                      <img
                        className="web-hub-runtime-picture_image__63vQy"
                        width="240"
                        height="320"
                        sizes="(max-width: 767px) min(14vw, 61px), clamp(70px, 8vw, 86px)"
                        alt=""
                        aria-hidden="true"
                        loading="eager"
                        decoding="async"
                        fetchPriority="auto"
                        draggable="false"
                        src="/images/web-hub/v1/modals/wheel/wheel-pointer-320w.webp"
                      />
                    </picture>

                    {/* POINTER TICK FEEDBACK */}
                    <div
                      className={`wheel_pointer__6eU1V ${spinning ? 'wheel_pointerActive__TWWC5' : ''}`}
                      aria-hidden="true"
                    />

                    {/* ROTATING DIAL */}
                    <div
                      className="wheel_dial__lCbK4"
                      role="presentation"
                      style={{
                        backgroundImage: CONIC_GRADIENT,
                        transform: `rotate(${rotation}deg)`,
                        transition: spinning
                          ? 'transform 4.5s cubic-bezier(0.12, 0.72, 0.12, 1)'
                          : 'none',
                      }}
                    >
                      {/* SECTOR MATERIAL OVERLAY */}
                      <picture
                        className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h wheel_wheelSectorMaterialAsset__FtsyY"
                        style={
                          {
                            '--web-hub-asset-aspect': '480 / 480',
                            '--web-hub-asset-position': '50% 50%',
                          } as React.CSSProperties
                        }
                        data-web-hub-runtime-version="v1"
                        data-web-hub-asset="wheel-sector-material-overlay"
                        data-asset-family-id="wheel"
                        data-web-hub-placement="wheel-sector-material-overlay"
                        data-web-hub-fit="contain"
                        data-web-hub-activation-policy="immediate"
                        data-web-hub-viewport-intersection="not_observed"
                        data-web-hub-observer-state="not_applicable"
                        data-web-hub-observer-settled="not_applicable"
                        data-web-hub-activation-state="true"
                        data-web-hub-picture-mounted="true"
                        data-web-hub-network-picture="true"
                        data-web-hub-candidate-widths="240,320,480,640"
                        aria-hidden="true"
                      >
                        <source
                          type="image/avif"
                          srcSet="/images/web-hub/v1/modals/wheel/wheel-sector-material-overlay-240w.avif 240w, /images/web-hub/v1/modals/wheel/wheel-sector-material-overlay-320w.avif 320w, /images/web-hub/v1/modals/wheel/wheel-sector-material-overlay-480w.avif 480w, /images/web-hub/v1/modals/wheel/wheel-sector-material-overlay-640w.avif 640w"
                          sizes="(max-width: 767px) min(80vw, 350px), clamp(402px, 46vw, 492px)"
                        />
                        <source
                          type="image/webp"
                          srcSet="/images/web-hub/v1/modals/wheel/wheel-sector-material-overlay-240w.webp 240w, /images/web-hub/v1/modals/wheel/wheel-sector-material-overlay-320w.webp 320w, /images/web-hub/v1/modals/wheel/wheel-sector-material-overlay-480w.webp 480w, /images/web-hub/v1/modals/wheel/wheel-sector-material-overlay-640w.webp 640w"
                          sizes="(max-width: 767px) min(80vw, 350px), clamp(402px, 46vw, 492px)"
                        />
                        <img
                          className="web-hub-runtime-picture_image__63vQy"
                          width="480"
                          height="480"
                          sizes="(max-width: 767px) min(80vw, 350px), clamp(402px, 46vw, 492px)"
                          alt=""
                          aria-hidden="true"
                          loading="eager"
                          decoding="async"
                          fetchPriority="auto"
                          draggable="false"
                          src="/images/web-hub/v1/modals/wheel/wheel-sector-material-overlay-480w.webp"
                        />
                      </picture>

                      {/* 10 SECTOR LABELS */}
                      {SECTORS.map((sector) => (
                        <div
                          key={sector.prize}
                          className="wheel_sectorLabel__ZV7Up"
                          style={{
                            transform: `rotate(${sector.angle}deg)`,
                            color: sector.textColor,
                          }}
                        >
                          <span className="wheel_sectorLabelText__TGFQO">
                            {sector.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* CENTER HUB */}
                    <picture
                      className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h wheel_wheelCenterHubAsset__Q9ivE"
                      style={
                        {
                          '--web-hub-asset-aspect': '480 / 480',
                          '--web-hub-asset-position': '50% 50%',
                        } as React.CSSProperties
                      }
                      data-web-hub-runtime-version="v1"
                      data-web-hub-asset="wheel-center-hub"
                      data-asset-family-id="wheel"
                      data-web-hub-placement="wheel-center-hub"
                      data-web-hub-fit="contain"
                      data-web-hub-activation-policy="immediate"
                      data-web-hub-viewport-intersection="not_observed"
                      data-web-hub-observer-state="not_applicable"
                      data-web-hub-observer-settled="not_applicable"
                      data-web-hub-activation-state="true"
                      data-web-hub-picture-mounted="true"
                      data-web-hub-network-picture="true"
                      data-web-hub-candidate-widths="240,320,480,640"
                      aria-hidden="true"
                    >
                      <source
                        type="image/avif"
                        srcSet="/images/web-hub/v1/modals/wheel/wheel-center-hub-240w.avif 240w, /images/web-hub/v1/modals/wheel/wheel-center-hub-320w.avif 320w, /images/web-hub/v1/modals/wheel/wheel-center-hub-480w.avif 480w, /images/web-hub/v1/modals/wheel/wheel-center-hub-640w.avif 640w"
                        sizes="(max-width: 767px) min(31vw, 136px), clamp(156px, 18vw, 191px)"
                      />
                      <source
                        type="image/webp"
                        srcSet="/images/web-hub/v1/modals/wheel/wheel-center-hub-240w.webp 240w, /images/web-hub/v1/modals/wheel/wheel-center-hub-320w.webp 320w, /images/web-hub/v1/modals/wheel/wheel-center-hub-480w.webp 480w, /images/web-hub/v1/modals/wheel/wheel-center-hub-640w.webp 640w"
                        sizes="(max-width: 767px) min(31vw, 136px), clamp(156px, 18vw, 191px)"
                      />
                      <img
                        className="web-hub-runtime-picture_image__63vQy"
                        width="480"
                        height="480"
                        sizes="(max-width: 767px) min(31vw, 136px), clamp(156px, 18vw, 191px)"
                        alt=""
                        aria-hidden="true"
                        loading="eager"
                        decoding="async"
                        fetchPriority="auto"
                        draggable="false"
                        src="/images/web-hub/v1/modals/wheel/wheel-center-hub-480w.webp"
                      />
                    </picture>

                    {/* SPIN BUTTON */}
                    <button
                      type="button"
                      className="wheel_spinBtn__gzb0K"
                      aria-label="Вращать колесо"
                      onClick={handleSpin}
                      disabled={!canSpin}
                    >
                      <span className="wheel_spinBtnText__PYYkr">КРУТИТЬ</span>
                    </button>
                  </div>
                </div>

                {/* STATUS DOCK */}
                <div className="wheel_statusDock__7b_V8" aria-live="polite">
                  <div className="wheel_dockStatus__GidGc">
                    <span className="wheel_dockEyebrow__vYFHb">Колесо фортуны</span>
                    <span className="wheel_dockLine__84sBw">
                      {spinning
                        ? 'Колесо вращается...'
                        : spinsLeft > 0
                        ? `Осталось ${spinsLeft} ${pluralSpins(spinsLeft)}`
                        : 'Спины на сегодня исчерпаны'}
                    </span>
                    <span className="wheel_dockSecondary__bxOfH">
                      {spinning
                        ? 'Удачи! Пусть выпадет максимальный приз!'
                        : spinsLeft > 0
                        ? 'Крутите колесо и выигрывайте реальные рубли'
                        : 'Новые спины начисляются каждый день в 00:00 UTC'}
                    </span>
                  </div>
                  <div className="wheel_dockEnergy__V9qW_" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            </div>

            {/* CELEBRATION RESULT LAYER */}
            {result !== null && (
              <div
                className="wheel_resultLayer__haMxn"
                data-celebration-style={celebrationStyle}
                role="dialog"
                aria-modal="true"
              >
                <div className="wheel_resultAura__4qqZu">
                  <div className="wheel_resultOrbit__xpVhb" />
                  {CELEBRATION_SPARKS.map((spark, idx) => (
                    <span
                      key={idx}
                      className="wheel_resultSpark__XuFkJ"
                      style={
                        {
                          '--wheel-result-spark-angle': spark.angle,
                          '--wheel-result-spark-distance': spark.distance,
                          '--wheel-result-spark-delay': spark.delay,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
                <div className="wheel_resultCard__cDoQ9">
                  <svg
                    className="wheel_resultMedallion__PCrU5"
                    viewBox="0 0 88 88"
                    focusable="false"
                    aria-hidden="true"
                  >
                    <circle cx="44" cy="44" r="38" />
                    <circle cx="44" cy="44" r="32" />
                    <path d="M44 24l5.87 11.9 13.13 1.9-9.5 9.26 2.24 13.08L44 54.02 32.26 60.14l2.24-13.08-9.5-9.26 13.13-1.9z" />
                  </svg>
                  <span className="wheel_resultKicker__O7AtX">Выигрыш</span>
                  <strong className="wheel_resultAmount__QA3_j">
                    +{formatRub(result)}
                  </strong>
                  <span className="wheel_resultBalance__NccvP">
                    Баланс: {formatRub(balance)}
                  </span>
                  <span className="wheel_resultAuthority__gX1y1">
                    {spinsLeft > 0
                      ? `Осталось спинов: ${spinsLeft}`
                      : 'Все спины на сегодня использованы'}
                  </span>
                  <div className="wheel_resultActions__BcjLZ">
                    {spinsLeft > 0 ? (
                      <>
                        <button
                          type="button"
                          className="wheel_resultPrimary__p0rDL"
                          onClick={handleSpinAgain}
                        >
                          Крутить ещё
                        </button>
                        <button
                          type="button"
                          className="wheel_resultSecondary__ukmOv"
                          onClick={() => setResult(null)}
                        >
                          Забрать
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="wheel_resultPrimary__p0rDL"
                        onClick={() => setResult(null)}
                      >
                        Отлично
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
