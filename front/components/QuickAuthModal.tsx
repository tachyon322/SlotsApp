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
import { Check, Copy, Loader2 } from 'lucide-react';
import { authApi, configApi } from '@/lib/api';
import { useUser } from './UserProvider';
import { ModalShell } from './ModalShell';
import { getAffiliateRef } from './AffiliateRefTracker';

const WELCOME_BONUS_DEFAULT = 8888;

const HAS_ACCOUNT_KEY = 'litgame:hasAccount';

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

  useEffect(() => {
    let cancelled = false;
    configApi
      .get()
      .then((cfg) => {
        if (!cancelled) setWelcomeBonus(cfg.welcomeBonus);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const openQuickAuth = useCallback(() => {
    setStep('welcome');
    setCredentials(null);
    setOpen(true);
    const ref = getAffiliateRef();
    if (ref) {
      configApi
        .registrationBonus(ref)
        .then((res) => {
          if (res && Number.isFinite(res.bonus) && res.bonus >= 0) setWelcomeBonus(res.bonus);
        })
        .catch(() => {});
    }
  }, []);

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(false);
      setError(null);
      setCopied(false);
    }
  }, [open]);

  const handleRegister = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.quick(getAffiliateRef());
      onRegistered({
        login: res.login,
        password: res.password,
        balance: res.balance,
      });
    } catch (err) {
      setError(
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
        `Логин: ${credentials.login}\nПароль: ${credentials.password}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      titleId="quick-auth-title"
      maxWidthClass="max-w-[28rem]"
    >
      {step === 'welcome' ? (
        <div className="text-center">
          <div className="relative -mx-6 -mt-6 mb-4 h-40 sm:h-48 overflow-hidden rounded-t-2xl bg-gradient-to-br from-amber-950/60 via-zinc-900 to-emerald-950/40 border-b border-amber-700/20">
            <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_110%,rgba(251,191,36,0.18),transparent_60%)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl sm:text-4xl font-black text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]">
                +{welcomeBonus.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </div>

          <h2
            id="quick-auth-title"
            className="text-xl font-bold text-white mb-1"
          >
            Бонус +{welcomeBonus.toLocaleString('ru-RU')} ₽ при регистрации
          </h2>
          <p className="text-zinc-400 text-sm mb-6">Всем новым пользователям</p>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-button px-sm py-xs mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={loading}
            className="relative w-full h-14 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-lg font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all overflow-hidden disabled:opacity-60"
          >
            <span className="absolute inset-0 overflow-hidden rounded-xl">
              <span className="absolute inset-0 -translate-x-full animate-[btn-shine_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </span>
            <span className="relative z-10 inline-flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Создание аккаунта...
                </>
              ) : (
                'Регистрация в 1 клик'
              )}
            </span>
          </button>
          <div className="pb-2" />
        </div>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Check className="w-8 h-8 text-white" strokeWidth={3} />
          </div>
          <h2
            id="quick-auth-title"
            className="text-2xl font-bold text-white mb-2"
          >
            Регистрация успешна!
          </h2>
          <p className="text-blue-400 text-sm font-medium mb-6">
            +{credentials?.balance.toLocaleString('ru-RU') ?? ''} руб. на балансе
          </p>

          {credentials && (
            <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-xl p-5 mb-4 text-left">
              <div className="mb-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">
                  Логин
                </span>
                <p className="text-white text-lg font-mono font-semibold mt-0.5 break-all">
                  {credentials.login}
                </p>
              </div>
              <div className="border-t border-zinc-800 my-3" />
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">
                  Пароль
                </span>
                <p className="text-white text-lg font-mono font-semibold mt-0.5 break-all">
                  {credentials.password}
                </p>
              </div>
            </div>
          )}

          <p className="text-zinc-400 text-xs mb-5">
            Сохраните данные или сделайте скриншот
          </p>

          <div className="space-y-3 pb-4">
            <button
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 rounded-xl"
            >
              <div className="flex items-center gap-2">
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span>{copied ? 'Скопировано' : 'Скопировать'}</span>
              </div>
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold transition-colors w-full h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/25"
            >
              Продолжить
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
