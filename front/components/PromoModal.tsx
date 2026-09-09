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
import { AlertCircle, Loader2, Ticket, Zap } from 'lucide-react';
import { useUser } from './UserProvider';
import { useAuthModal } from './AuthModal';
import { walletApi } from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

interface PromoModalContextValue {
  openPromo: (initialCode?: string | unknown) => void;
}

const PromoModalContext = createContext<PromoModalContextValue>({
  openPromo: () => {},
});

export function usePromoModal() {
  return useContext(PromoModalContext);
}

export function PromoModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prefilledCode, setPrefilledCode] = useState('');

  const openPromo = useCallback((initialCode?: string | unknown) => {
    if (typeof initialCode === 'string') {
      setPrefilledCode(initialCode);
    } else {
      setPrefilledCode('');
    }
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setPrefilledCode('');
  }, []);

  const contextValue = useMemo<PromoModalContextValue>(
    () => ({ openPromo }),
    [openPromo],
  );

  return (
    <PromoModalContext.Provider value={contextValue}>
      {children}
      <PromoModal open={open} onClose={close} initialCode={prefilledCode} />
    </PromoModalContext.Provider>
  );
}

interface SuccessPromo {
  code: string;
  rewardAmount: number;
  message: string;
}

function PromoModal({
  open,
  onClose,
  initialCode = '',
}: {
  open: boolean;
  onClose: () => void;
  initialCode?: string;
}) {
  const { user, refresh } = useUser();
  const { openAuth } = useAuthModal();
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<SuccessPromo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode(initialCode);
      setLoading(false);
      setError(null);
      setSuccessResult(null);

      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, initialCode]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, loading, onClose]);

  const handleActivate = async () => {
    const trimmed = code.trim();
    if (!trimmed || loading) return;

    if (!user) {
      openAuth('signin');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await walletApi.activatePromo(trimmed);
      showSuccess(res.message);
      setSuccessResult({
        code: trimmed,
        rewardAmount: res.rewardAmount,
        message: res.message,
      });
      await refresh();
    } catch (err) {
      const msg = (err as Error).message || 'Не удалось активировать промокод';
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="web-dialog_overlay__MnStH"
      data-web-dialog-frame="web-dialog-promo"
      data-web-dialog-size="compact"
      data-web-dialog-mobile="detached"
      data-web-dialog-placement="center"
      data-web-dialog-topmost="true"
      data-close-blocked={loading ? 'true' : 'false'}
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
        onClick={loading ? undefined : onClose}
      />
      <section
        className="web-dialog_panel__ZC8Km"
        role="dialog"
        aria-labelledby="promo-dialog-title"
        aria-describedby="promo-dialog-desc"
        tabIndex={-1}
        data-web-dialog-panel="true"
        data-web-dialog-asset="promo"
        data-web-dialog-asset-phase="ready"
        aria-modal="true"
      >
        <div className="web-dialog_chrome__jivZf" data-web-dialog-chrome="true">
          <button
            type="button"
            className="web-dialog_close__DPjMy"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={loading}
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
          <div className="promo-sheet_webSheet__9PmTw">
            {/* Visual Chamber */}
            <aside
              className="promo-sheet_webArt__kQWk8"
              data-promo-art-phase={successResult ? 'success' : 'idle'}
              aria-hidden="true"
            >
              <div className="promo-sheet_webArtBeam__bTwwB" />

              <picture className="promo-sheet_webArtHaloAsset__ysSUB">
                <source
                  type="image/avif"
                  srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-640w.avif 640w, /images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-960w.avif 960w"
                />
                <source
                  type="image/webp"
                  srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-640w.webp 640w, /images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-960w.webp 960w"
                />
                <img
                  src="/images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-640w.webp"
                  alt=""
                  draggable={false}
                />
              </picture>

              <picture className="promo-sheet_webArtPedestalAsset__jPxFf">
                <source
                  type="image/avif"
                  srcSet="/images/web-hub/v1/pages/achievements/achievement-reward-pedestal-640w.avif"
                />
                <source
                  type="image/webp"
                  srcSet="/images/web-hub/v1/pages/achievements/achievement-reward-pedestal-640w.webp"
                />
                <img
                  src="/images/web-hub/v1/pages/achievements/achievement-reward-pedestal-640w.webp"
                  alt=""
                  draggable={false}
                />
              </picture>

              <picture className="promo-sheet_webArtTicketAsset__gZv6G">
                <source
                  type="image/avif"
                  srcSet="/images/web-hub/v1/modals/family-b-promo/promo-ticket-main-320w.avif 320w, /images/web-hub/v1/modals/family-b-promo/promo-ticket-main-480w.avif 480w"
                  sizes="(max-width: 720px) 44vw, 320px"
                />
                <source
                  type="image/webp"
                  srcSet="/images/web-hub/v1/modals/family-b-promo/promo-ticket-main-320w.webp 320w, /images/web-hub/v1/modals/family-b-promo/promo-ticket-main-480w.webp 480w"
                  sizes="(max-width: 720px) 44vw, 320px"
                />
                <img
                  src="/images/web-hub/v1/modals/family-b-promo/promo-ticket-main-480w.webp"
                  alt=""
                  draggable={false}
                />
              </picture>
            </aside>

            {/* Form Column */}
            <div className="promo-sheet_formColumn__fToYG">
              <div className="promo-sheet_header__fP9oO">
                <span className="promo-sheet_eyebrow__uHOPu">LITGAME PROMO</span>
              </div>

              <h2 id="promo-dialog-title" className="promo-sheet_title__9TERQ">
                {successResult ? 'Бонус получен!' : 'Активация кода'}
              </h2>

              <p id="promo-dialog-desc" className="promo-sheet_subtitle__h3Vgp">
                {successResult
                  ? 'Бонусные средства успешно начислены на ваш баланс'
                  : 'Введите промокод для мгновенного зачисления бонуса на ваш баланс'}
              </p>

              {successResult ? (
                <div className="promo-sheet_successContent__czplI">
                  <div className="promo-sheet_cardEmbedded__ibBHJ">
                    <span className="promo-sheet_cardTitle__uZTYR">ПРОМОКОД АКТИВИРОВАН</span>
                    <span className="promo-sheet_cardCode___dw3m">{successResult.code.toUpperCase()}</span>
                    <div className="promo-sheet_cardAmount___GRbi">
                      +{new Intl.NumberFormat('ru-RU').format(successResult.rewardAmount)} ₽
                    </div>
                  </div>
                  <button
                    type="button"
                    className="promo-sheet_cta__0cBHC"
                    style={{ width: '100%', marginTop: '6px' }}
                    onClick={() => {
                      setSuccessResult(null);
                      setCode('');
                      onClose();
                    }}
                  >
                    Отлично
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleActivate();
                  }}
                  className="flex flex-col gap-3.5"
                >
                  <div
                    className={
                      error
                        ? 'promo-sheet_inputWrapError__SnSm9'
                        : 'promo-sheet_inputWrap__M0ABU'
                    }
                  >
                    <div className="promo-sheet_inputIcon__yw0pe">
                      <Ticket className="w-5 h-5" />
                    </div>
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Введите промокод"
                      maxLength={24}
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        if (error) setError(null);
                      }}
                      disabled={loading}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="promo-sheet_input__sBAT_"
                    />
                  </div>

                  {error && (
                    <p className="promo-sheet_errorMsg__YxXw_">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!code.trim() || loading}
                    className="promo-sheet_cta__0cBHC"
                  >
                    {loading ? (
                      <>
                        <span className="promo-sheet_spinner__Vbqy7" />
                        <span>Проверка...</span>
                      </>
                    ) : !user ? (
                      'Войти и активировать'
                    ) : (
                      'Активировать'
                    )}
                  </button>

                  <div
                    className="promo-sheet_instantPill__IltsZ"
                    data-status={loading ? 'pending' : error ? 'invalid' : 'idle'}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Проверяем промокод...</span>
                      </>
                    ) : error ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{error}</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Промокод активируется моментально</span>
                      </>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
