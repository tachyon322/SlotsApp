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
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { partnerApi, referralApi } from '@/lib/api';
import { useUser } from './UserProvider';
import { getAffiliateRef } from './AffiliateRefTracker';
import { showError } from '@/lib/toast';

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Введите корректный email';
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
      } else {
        const result = await authClient.signIn.email({
          email: form.email.trim(),
          password: form.password,
        });
        if (result.error) {
          const errMsg = mapAuthError(result.error.code, result.error.message);
          setErrors({ email: errMsg });
          showError(errMsg);
          return;
        }
      }

      if (isSignup) {
        const ref = getAffiliateRef();
        if (ref) {
          partnerApi.attrib(ref).catch(() => {
            // best-effort attribution
          });
          referralApi.attribute(ref).catch(() => {
            // best-effort attribution
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

  return (
    <div
      className="web-dialog_overlay__MnStH"
      data-web-dialog-frame="web-dialog-auth"
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
        aria-labelledby="auth-dialog-title"
        aria-describedby="auth-dialog-desc"
        tabIndex={-1}
        data-web-dialog-panel="true"
        data-web-dialog-asset="auth"
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
          <div className="auth-sheet_webSheet">
            {/* Left Visual Chamber (Art) */}
            <aside className="auth-sheet_webArt" aria-hidden="true">
              <div className="auth-sheet_artBeam" />

              {/* Glowing portal halo in background */}
              <picture className="auth-sheet_artHalo">
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

              {/* Cyber pedestal base */}
              <picture className="auth-sheet_artPedestal">
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

              {/* Floating LitGame brand mark with cyber badge */}
              <div className="auth-sheet_artHero">
                <img
                  src="/newVisual/brand-mark.svg"
                  alt="LITGAME"
                  className="auth-sheet_brandMarkImg"
                  draggable={false}
                />
                <div className="auth-sheet_artBadge">
                  <span>{isSignup ? 'WELCOME BONUS' : 'CYBER ARENA'}</span>
                </div>
              </div>
            </aside>

            {/* Right Form Column */}
            <div className="auth-sheet_formColumn">
              {/* Segmented Mode Tabs: Вход / Регистрация */}
              <div className="auth-sheet_tabs" role="tablist" aria-label="Авторизация">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isSignup}
                  className="auth-sheet_tab"
                  onClick={() => {
                    onModeChange('signin');
                    setErrors({});
                  }}
                >
                  Вход
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSignup}
                  className="auth-sheet_tab"
                  onClick={() => {
                    onModeChange('signup');
                    setErrors({});
                  }}
                >
                  Регистрация
                </button>
              </div>

              <div className="auth-sheet_header">
                <span className="auth-sheet_eyebrow">
                  {isSignup ? 'НОВЫЙ АККАУНТ' : 'С ВОЗВРАЩЕНИЕМ'}
                </span>
                <h2 id="auth-dialog-title" className="auth-sheet_title">
                  {isSignup ? 'Создать аккаунт' : 'Войти в профиль'}
                </h2>
                <p id="auth-dialog-desc" className="auth-sheet_subtitle">
                  {isSignup
                    ? 'Зарегистрируйтесь и получите доступ ко всем играм арены'
                    : 'Введите свои данные для входа в игровую вселенную LitGame'}
                </p>
              </div>

              <form className="auth-sheet_form" onSubmit={handleSubmit} noValidate>
                {/* Email field */}
                <div className="auth-sheet_field">
                  <label className="auth-sheet_label" htmlFor="auth-email">
                    Электронная почта
                  </label>
                  <div
                    className={
                      errors.email
                        ? 'auth-sheet_inputWrapError'
                        : 'auth-sheet_inputWrap'
                    }
                  >
                    <div className="auth-sheet_inputIcon">
                      <Mail className="w-5 h-5" />
                    </div>
                    <input
                      ref={emailInputRef}
                      id="auth-email"
                      type="email"
                      placeholder="name@domain.com"
                      value={form.email}
                      onChange={(e) => handleChange('email')(e.target.value)}
                      autoComplete="email"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={loading}
                      className="auth-sheet_input"
                    />
                  </div>
                  {errors.email && (
                    <p className="auth-sheet_fieldError">{errors.email}</p>
                  )}
                </div>

                {/* Password field */}
                <div className="auth-sheet_field">
                  <label className="auth-sheet_label" htmlFor="auth-password">
                    Пароль
                  </label>
                  <div
                    className={
                      errors.password
                        ? 'auth-sheet_inputWrapError'
                        : 'auth-sheet_inputWrap'
                    }
                  >
                    <div className="auth-sheet_inputIcon">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Минимум 6 символов"
                      value={form.password}
                      onChange={(e) => handleChange('password')(e.target.value)}
                      autoComplete={isSignup ? 'new-password' : 'current-password'}
                      disabled={loading}
                      className="auth-sheet_input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                      className="auth-sheet_togglePassword"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="auth-sheet_fieldError">{errors.password}</p>
                  )}
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="auth-sheet_cta"
                >
                  {loading ? (
                    <>
                      <span className="auth-sheet_spinner" />
                      <span>Подождите...</span>
                    </>
                  ) : isSignup ? (
                    'Зарегистрироваться'
                  ) : (
                    'Войти в аккаунт'
                  )}
                </button>

                {/* Footer Switch */}
                <div className="auth-sheet_footer">
                  <span className="auth-sheet_footerHint">
                    {isSignup ? 'Уже есть профиль?' : 'Еще нет профиля?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onModeChange(isSignup ? 'signin' : 'signup');
                      setErrors({});
                    }}
                    className="auth-sheet_switchBtn"
                  >
                    {isSignup ? 'Войти' : 'Создать аккаунт'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
