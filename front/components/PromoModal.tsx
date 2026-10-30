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
import Image from 'next/image';
import { Loader2, Zap } from 'lucide-react';
import { useUser } from './UserProvider';
import { LgSheet } from './ui/LgSheet';
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

  const finish = () => {
    setSuccessResult(null);
    setCode('');
    onClose();
  };

  return (
    <LgSheet
      titleId="promo-dialog-title"
      title="Промокод"
      onClose={onClose}
      closeDisabled={loading}
      state={successResult ? 'success' : 'idle'}
      footer={
        successResult ? (
          <button type="button" className="pg-btn pg-btn-acc" onClick={finish}>
            Отлично
          </button>
        ) : (
          <button type="submit" form="promo-form" disabled={!code.trim() || loading} className="pg-btn pg-btn-acc">
            {loading ? (
              <>
                <span className="pg-spin" />
                Проверка...
              </>
            ) : !user ? (
              'Войти и активировать'
            ) : (
              'Активировать'
            )}
          </button>
        )
      }
    >
      {successResult ? (
        <div className="ls-res">
          <Image src="/lg/img/status-ok.webp" alt="" width={150} height={150} />
          <h3>Бонус получен!</h3>
          <p>Бонусные средства успешно начислены на ваш баланс</p>
          <strong>+{new Intl.NumberFormat('ru-RU').format(successResult.rewardAmount)} ₽</strong>
          <span className="ls-codechip">{successResult.code.toUpperCase()}</span>
        </div>
      ) : (
        <form
          id="promo-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleActivate();
          }}
        >
          <div className="ls-hero">
            <Image src="/lg/img/promo-ticket.webp" alt="" width={150} height={150} priority />
            <h3>Есть промокод?</h3>
            <p>Введите промокод для мгновенного зачисления бонуса на ваш баланс</p>
          </div>
          <input
            ref={inputRef}
            type="text"
            className="ls-code"
            data-invalid={Boolean(error)}
            aria-label="Промокод"
            placeholder="ПРОМОКОД"
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
          />
          {error ? (
            <p className="ls-sub" data-error="true" style={{ marginTop: 10, textAlign: 'center' }}>
              {error}
            </p>
          ) : (
            <p className="ls-hint">
              {loading ? <Loader2 className="ls-spin" /> : <Zap />}
              {loading ? 'Проверяем промокод...' : 'Промокод активируется моментально'}
            </p>
          )}
        </form>
      )}
    </LgSheet>
  );
}
