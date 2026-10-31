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
import { Check, Copy, Loader2 } from 'lucide-react';
import { authApi, configApi } from '@/lib/api';
import { useUser } from './UserProvider';
import { LgSheet } from './ui/LgSheet';
import { useAuthModal } from './AuthModal';
import { getAffiliateRef, getClickToken, getInviteRef } from './AffiliateRefTracker';
import { showError } from '@/lib/toast';
import { track } from '@/lib/analytics';

const WELCOME_BONUS_DEFAULT = 8888;

const HAS_ACCOUNT_KEY = 'STARX:hasAccount';

interface QuickAuthModalContextValue {
  openQuickAuth: () => void;
}

const QuickAuthModalContext = createContext<QuickAuthModalContextValue>({
  openQuickAuth: () => {},
});

export function useQuickAuthModal() {
  return useContext(QuickAuthModalContext);
}

type QuickAuthStep = 'welcome' | 'success';

interface Credentials {
  login: string;
  email: string;
  password: string;
  balance: number;
}

export function QuickAuthModalProvider({ children }: { children: ReactNode }) {
  const { user, isLoading, refresh } = useUser();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<QuickAuthStep>('welcome');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [welcomeBonus, setWelcomeBonus] = useState(WELCOME_BONUS_DEFAULT);

  const hasAccountRef = useRef(false);
  const autoPromptedRef = useRef(false);
  const customBonusAppliedRef = useRef(false);
  const bonusRequestIdRef = useRef(0);

  const fetchBonus = useCallback((refArg?: string, clickTokenArg?: string) => {
    const ref = refArg ?? getAffiliateRef();
    const clickToken = clickTokenArg ?? getClickToken();
    if (ref || clickToken) {
      const reqId = ++bonusRequestIdRef.current;
      configApi
        .registrationBonus(ref, clickToken)
        .then((res) => {
          if (bonusRequestIdRef.current === reqId && res && Number.isFinite(res.bonus) && res.bonus >= 0) {
            customBonusAppliedRef.current = true;
            setWelcomeBonus(res.bonus);
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ref = getAffiliateRef();
    const clickToken = getClickToken();
    if (ref || clickToken) {
      fetchBonus(ref, clickToken);
    }
    configApi
      .get()
      .then((cfg) => {
        if (!cancelled && !customBonusAppliedRef.current && !getAffiliateRef() && !getClickToken()) {
          setWelcomeBonus(cfg.welcomeBonus);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchBonus]);

  const openQuickAuth = useCallback(() => {
    setStep('welcome');
    setCredentials(null);
    setOpen(true);
    fetchBonus();
  }, [fetchBonus]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(HAS_ACCOUNT_KEY) === '1') {
      hasAccountRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (user && !hasAccountRef.current) {
      hasAccountRef.current = true;
      localStorage.setItem(HAS_ACCOUNT_KEY, '1');
    }
  }, [user]);

  useEffect(() => {
    if (
      !isLoading &&
      !user &&
      !hasAccountRef.current &&
      !autoPromptedRef.current &&
      !open
    ) {
      autoPromptedRef.current = true;
      openQuickAuth();
    }
  }, [isLoading, user, open, openQuickAuth]);

  const contextValue = useMemo<QuickAuthModalContextValue>(
    () => ({ openQuickAuth }),
    [openQuickAuth],
  );

  return (
    <QuickAuthModalContext.Provider value={contextValue}>
      {children}
      <QuickAuthModal
        open={open}
        step={step}
        welcomeBonus={welcomeBonus}
        credentials={credentials}
        onClose={close}
        onRegistered={(cred) => {
          setCredentials(cred);
          setStep('success');
          void refresh();
        }}
      />
    </QuickAuthModalContext.Provider>
  );
}

interface QuickAuthModalProps {
  open: boolean;
  step: QuickAuthStep;
  welcomeBonus: number;
  credentials: Credentials | null;
  onClose: () => void;
  onRegistered: (credentials: Credentials) => void;
}

function QuickAuthModal({
  open,
  step,
  welcomeBonus,
  credentials,
  onClose,
  onRegistered,
}: QuickAuthModalProps) {
  const { openAuth } = useAuthModal();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(false);
      setCopied(false);
    }
  }, [open]);

  // Скролл body и Escape (раньше это делал ModalShell)
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const handleRegister = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await authApi.quick(getAffiliateRef(), getClickToken(), getInviteRef());
      track('signup', { method: 'quick' });
      onRegistered({
        login: res.login,
        email: res.email,
        password: res.password,
        balance: res.balance,
      });
    } catch (err) {
      showError(
        (err as { message?: string }).message ||
          'Не удалось создать аккаунт, попробуйте ещё раз',
      );
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `Email: ${credentials.email}\nПароль: ${credentials.password}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleSignIn = () => {
    onClose();
    openAuth('signin');
  };

  if (!open) return null;

  const bonusText = `+${welcomeBonus.toLocaleString('ru-RU')} ₽`;

  if (step === 'welcome') {
    return (
      <LgSheet
        titleId="quick-auth-title"
        title="StarX"
        onClose={onClose}
        state="welcome"
        footer={
          <button type="button" className="pg-btn pg-btn-acc" onClick={handleRegister} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="ls-spin" />
                Создание аккаунта...
              </>
            ) : (
              'Регистрация в 1 клик'
            )}
          </button>
        }
      >
        <div className="ls-hero">
          <Image src="/lg/img/obj-bonus.webp" alt="" width={170} height={170} priority />
          <strong>{bonusText}</strong>
          <h3>Бонус за регистрацию</h3>
          <p>Всем новым пользователям — сразу на баланс</p>
          <div className="ls-ticks">
            <span>
              <Check />
              Без почты и пароля
            </span>
            <span>
              <Check />
              За 1 секунду
            </span>
          </div>
        </div>
        <p className="ls-switch">
          Уже есть аккаунт?{' '}
          <button type="button" onClick={handleSignIn} disabled={loading}>
            Войти
          </button>
        </p>
      </LgSheet>
    );
  }

  return (
    <LgSheet
      titleId="quick-auth-title"
      title="Аккаунт создан"
      onClose={onClose}
      state="success"
      footer={
        <>
          <button type="button" className="pg-btn pg-btn-sec ls-fit" onClick={handleCopy}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Скопировано' : 'Скопировать'}
          </button>
          <button type="button" className="pg-btn pg-btn-acc" onClick={onClose}>
            Продолжить
          </button>
        </>
      }
    >
      <div className="ls-res" data-size="sm">
        <Image src="/lg/img/status-ok.webp" alt="" width={120} height={120} />
        <h3>Регистрация успешна!</h3>
        <p>+{credentials?.balance.toLocaleString('ru-RU') ?? ''} ₽ уже на балансе</p>
      </div>
      {credentials && (
        <div className="ls-cred">
          <div>
            <small>Email для входа</small>
            <b>{credentials.email}</b>
          </div>
          <div>
            <small>Пароль</small>
            <b>{credentials.password}</b>
          </div>
        </div>
      )}
      <p className="ls-warn">Сохраните данные или сделайте скриншот — они нужны для входа с другого устройства</p>
    </LgSheet>
  );
}
