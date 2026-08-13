'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Mail, Lock, UserPlus, LogIn, Eye, EyeOff } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { partnerApi, referralApi } from '@/lib/api';
import { useUser } from './UserProvider';
import { ModalShell } from './ModalShell';
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

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  autoFocus?: boolean;
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

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  leading,
  trailing,
  autoFocus,
}: FieldProps) {
  return (
    <div className="space-y-xs">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-300">
        {label}
      </label>
      <div className="relative">
        {leading && (
          <div className="absolute left-md top-1/2 -translate-y-1/2 pointer-events-none">
            {leading}
          </div>
        )}
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus={autoFocus}
          aria-invalid={!!error}
          className={`w-full py-sm bg-zinc-900/80 rounded-control border text-white placeholder:text-zinc-500 transition-colors focus:outline-none focus:ring-1 ${
            leading ? 'pl-12' : 'pl-md'
          } ${trailing ? 'pr-12' : 'pr-md'} ${
            error
              ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/20'
              : 'border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500/20'
          }`}
        />
        {trailing && (
          <div className="absolute right-md top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function AuthModal({ open, mode, onClose, onModeChange }: AuthModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isSignup = mode === 'signup';
  const ModeIcon = isSignup ? UserPlus : LogIn;
  const { refresh } = useUser();

  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setErrors({});
      setLoading(false);
      setShowPassword(false);
    }
  }, [open]);

  const handleChange = (field: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): Partial<FormState> => {
    const next: Partial<FormState> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
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
          email: form.email,
          password: form.password,
          name: form.email.split('@')[0] || 'Пользователь',
        });
        if (result.error) {
          showError(mapAuthError(result.error.code, result.error.message));
          return;
        }
      } else {
        const result = await authClient.signIn.email({
          email: form.email,
          password: form.password,
        });
        if (result.error) {
          showError(mapAuthError(result.error.code, result.error.message));
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

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      titleId="auth-modal-title"
      maxWidthClass="max-w-[28rem]"
    >
      <div className="text-center mb-xl">
        <div className="mx-auto mb-sm p-sm rounded-pill bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 w-fit">
          <ModeIcon className="w-7 h-7 text-emerald-500" />
        </div>
        <h2 id="auth-modal-title" className="text-xl font-bold text-white">
          {isSignup ? 'Регистрация' : 'Вход'}
        </h2>
        <p className="text-sm text-zinc-400 mt-2xs">
          {isSignup
            ? 'Создайте аккаунт, чтобы начать играть'
            : 'Рады видеть вас снова'}
        </p>
      </div>

      <form className="space-y-md" onSubmit={handleSubmit} noValidate>
        <Field
          id="auth-email"
          label="Эл. почта"
          type="email"
          placeholder="email@example.com"
          value={form.email}
          onChange={handleChange('email')}
          error={errors.email}
          trailing={<Mail className="w-4 h-4 text-zinc-500" />}
          autoFocus
        />

        <Field
          id="auth-password"
          label="Пароль"
          type={showPassword ? 'text' : 'password'}
          placeholder="Минимум 6 символов"
          value={form.password}
          onChange={handleChange('password')}
          error={errors.password}
          leading={<Lock className="w-4 h-4 text-zinc-500" />}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              className="p-2xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          }
        />

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-xs whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 shadow h-10 rounded-control px-2xl w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isSignup ? 'Создать аккаунт' : 'Войти'}
        </button>

        <div className="text-center pt-2xs pb-md">
          <button
            type="button"
            onClick={() => onModeChange(isSignup ? 'signin' : 'signup')}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {isSignup
              ? 'Уже есть аккаунт? Войдите'
              : 'Нет аккаунта? Зарегистрируйтесь'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
