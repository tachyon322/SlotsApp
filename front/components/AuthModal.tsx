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
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { bonusApi, partnerApi, referralApi } from '@/lib/api';
import { PRIVACY_HREF, TERMS_HREF } from '@/lib/legal';
import { useUser } from './UserProvider';
import { LgSheet } from './ui/LgSheet';
import { getAffiliateRef, getClickToken, getInviteRef } from './AffiliateRefTracker';
import { showError } from '@/lib/toast';
import { track } from '@/lib/analytics';

type AuthMode = 'signin' | 'signup';

interface AuthModalContextValue {
  openAuth: (mode: AuthMode) => void;
}

interface AuthModalProps {
  open: boolean;
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
}

interface FormState {
  email: string;
  password: string;
}

const AuthModalContext = createContext<AuthModalContextValue>({
  openAuth: () => {},
});

const INITIAL_FORM: FormState = {
  email: '',
  password: '',
};

// Аккаунты из «Регистрации в 1 клик» получают почту login@STARX.games, а
// раньше пользователю показывался только логин. При входе логин без «@»
// достраиваем до этой почты, чтобы такие пользователи могли войти.
const QUICK_AUTH_EMAIL_DOMAIN = 'STARX.games';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_RE = /^[A-Za-z0-9._-]+$/;

function toSignInEmail(value: string): string {
  const trimmed = value.trim();
  return trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}@${QUICK_AUTH_EMAIL_DOMAIN}`;
}

export function useAuthModal() {
  return useContext(AuthModalContext);
}

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signup');

  const openAuth = useCallback((next: AuthMode) => {
    setMode(next);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const contextValue = useMemo<AuthModalContextValue>(
    () => ({ openAuth }),
    [openAuth],
  );

  return (
    <AuthModalContext.Provider value={contextValue}>
      {children}
      <AuthModal open={open} mode={mode} onClose={close} onModeChange={setMode} />
    </AuthModalContext.Provider>
  );
}

function AuthModal({ open, mode, onClose, onModeChange }: AuthModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const isSignup = mode === 'signup';
  const { refresh } = useUser();

  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setErrors({});
      setLoading(false);
      setShowPassword(false);

      const timer = setTimeout(() => {
        emailInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Close on Escape key
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

  const handleChange = (field: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): Partial<FormState> => {
    const next: Partial<FormState> = {};
    const identifier = form.email.trim();
    const validIdentifier = isSignup
      ? EMAIL_RE.test(identifier)
      : EMAIL_RE.test(identifier) || LOGIN_RE.test(identifier);
    if (!validIdentifier) {
      next.email = isSignup ? 'Введите корректный email' : 'Введите email или логин';
    }
    if (form.password.length < 6) {
      next.password = 'Пароль должен содержать минимум 6 символов';
    }
    return next;
  };

  const mapAuthError = (code: string | undefined, message?: string): string => {
    switch (code) {
      case 'INVALID_EMAIL_OR_PASSWORD':
        return 'Неверный email или пароль';
      case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
        return 'Пользователь с таким email уже существует';
      case 'PASSWORD_TOO_SHORT':
        return 'Пароль слишком короткий';
      default:
        return message || 'Не удалось выполнить запрос';
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);

    try {
      if (isSignup) {
        const result = await authClient.signUp.email({
          email: form.email.trim(),
          password: form.password,
          name: form.email.trim().split('@')[0] || 'Пользователь',
        });
        if (result.error) {
          const errMsg = mapAuthError(result.error.code, result.error.message);
          setErrors({ email: errMsg });
          showError(errMsg);
          return;
        }
        track('signup', { method: 'email' });
      } else {
        const result = await authClient.signIn.email({
          email: toSignInEmail(form.email),
          password: form.password,
        });
        if (result.error) {
          const errMsg = mapAuthError(result.error.code, result.error.message);
          setErrors({ email: errMsg });
          showError(errMsg);
          return;
        }
        track('login', { method: 'email' });
      }

      if (isSignup) {
        const affiliateRef = getAffiliateRef();
        const clickToken = getClickToken();
        const inviteRef = getInviteRef();

        // Приветственный бонус начисляется сразу при регистрации — той же
        // логикой, что и в one-click флоу: кастомный бонус партнёрской ссылки
        // (CashX) либо стандартный бонус из админки. best-effort: если не
        // получилось, бонус остаётся доступен вручную в разделе «Задания».
        await bonusApi
          .claimWelcome(affiliateRef || undefined, clickToken || undefined)
          .catch(() => {
            // best-effort registration bonus
          });

        if (affiliateRef || clickToken) {
          partnerApi.attrib(affiliateRef || undefined, clickToken || undefined).catch(() => {
            // best-effort partner attribution
          });
        }
        if (inviteRef) {
          referralApi.attribute(inviteRef).catch(() => {
            // best-effort referral attribution
          });
        }
      }

      await refresh();
      onClose();
    } catch {
      showError('Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const switchMode = (next: AuthMode) => {
    onModeChange(next);
    setErrors({});
  };

  return (
    <LgSheet
      titleId="auth-dialog-title"
      title={isSignup ? 'Регистрация' : 'Вход'}
      onClose={onClose}
      closeDisabled={loading}
      state={mode}
      footer={
        <button type="submit" form="auth-form" disabled={loading} className="pg-btn pg-btn-acc">
          {loading ? (
            <>
              <span className="pg-spin" />
              Подождите...
            </>
          ) : isSignup ? (
            'Зарегистрироваться'
          ) : (
            'Войти'
          )}
        </button>
      }
    >
      <div className="ls-seg" role="tablist" aria-label="Авторизация">
        <button type="button" role="tab" aria-selected={!isSignup} onClick={() => switchMode('signin')}>
          Вход
        </button>
        <button type="button" role="tab" aria-selected={isSignup} onClick={() => switchMode('signup')}>
          Регистрация
        </button>
      </div>

      {isSignup ? (
        <div className="ls-plate">
          <Image src="/lg/img/obj-bonus.webp" alt="" width={50} height={50} />
          <div>
            <small>Сразу после регистрации</small>
            <b>Приветственный бонус</b>
          </div>
        </div>
      ) : (
        <div className="ls-hello">
          <Image src="/lg/img/logo-starx-mark.webp" alt="" width={104} height={104} />
          <h3>С возвращением</h3>
        </div>
      )}

      <form id="auth-form" onSubmit={handleSubmit} noValidate>
        <label className="ls-flbl" htmlFor="auth-email">
          {isSignup ? 'Электронная почта' : 'Почта или логин'}
        </label>
        <div className="ls-inp" data-invalid={Boolean(errors.email)}>
          <Mail />
          <input
            ref={emailInputRef}
            id="auth-email"
            type={isSignup ? 'email' : 'text'}
            placeholder={isSignup ? 'name@domain.com' : 'name@domain.com или логин'}
            value={form.email}
            onChange={(e) => handleChange('email')(e.target.value)}
            autoComplete={isSignup ? 'email' : 'username'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
          />
        </div>
        {errors.email && (
          <p className="ls-sub" data-error="true" style={{ marginTop: 6 }}>
            {errors.email}
          </p>
        )}

        <label className="ls-flbl" htmlFor="auth-password">
          Пароль
        </label>
        <div className="ls-inp" data-invalid={Boolean(errors.password)}>
          <Lock />
          <input
            id="auth-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Минимум 6 символов"
            value={form.password}
            onChange={(e) => handleChange('password')(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </button>
        </div>
        {errors.password && (
          <p className="ls-sub" data-error="true" style={{ marginTop: 6 }}>
            {errors.password}
          </p>
        )}
      </form>

      <p className="ls-legal">
        {isSignup ? 'Регистрируясь, вы принимаете ' : 'Продолжая, вы принимаете '}
        <Link href={TERMS_HREF} onClick={onClose}>
          Пользовательское соглашение
        </Link>{' '}
        и{' '}
        <Link href={PRIVACY_HREF} onClick={onClose}>
          Политику конфиденциальности
        </Link>
      </p>

      <p className="ls-switch">
        {isSignup ? 'Уже есть профиль?' : 'Нет аккаунта?'}{' '}
        <button type="button" onClick={() => switchMode(isSignup ? 'signin' : 'signup')}>
          {isSignup ? 'Войти' : 'Создать'}
        </button>
      </p>
    </LgSheet>
  );
}
