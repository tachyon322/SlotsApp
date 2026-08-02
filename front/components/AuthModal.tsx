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
import { X, Mail, Lock, UserPlus, LogIn, Eye, EyeOff } from 'lucide-react';

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
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-300">
        {label}
      </label>
      <div className="relative">
        {leading && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
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
          className={`w-full py-3 bg-zinc-900/80 rounded-xl border text-white placeholder:text-zinc-500 transition-colors focus:outline-none focus:ring-1 ${
            leading ? 'pl-12' : 'pl-4'
          } ${trailing ? 'pr-12' : 'pr-4'} ${
            error
              ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/20'
              : 'border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500/20'
          }`}
        />
        {trailing && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">{trailing}</div>
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
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  const isSignup = mode === 'signup';
  const ModeIcon = isSignup ? UserPlus : LogIn;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setForm(INITIAL_FORM);
      setErrors({});
      setLoading(false);
      setShowPassword(false);
      document.body.style.overflow = 'hidden';
    } else {
      setClosing(true);
      const timer = setTimeout(() => {
        setMounted(false);
        setClosing(false);
        document.body.style.overflow = '';
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <div
          className={`fixed inset-0 bg-black/70 will-change-[opacity] ${
            closing
              ? 'animate-[modal-backdrop-out_0.2s_cubic-bezier(0.4,0,1,1)_both]'
              : 'animate-[modal-backdrop-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]'
          }`}
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          className={`relative w-full max-w-md rounded-2xl bg-gradient-to-b from-zinc-950 to-black border border-zinc-800 shadow-2xl shadow-black/50 max-h-[85vh] overflow-hidden will-change-[transform,opacity] ${
            closing
              ? 'animate-[modal-panel-out_0.2s_cubic-bezier(0.4,0,1,1)_both]'
              : 'animate-[modal-panel-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute top-4 right-4 p-2 hover:bg-zinc-800 rounded-lg transition-colors z-10"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>

          <div className="overflow-y-auto overscroll-contain max-h-[calc(85vh-24px)]">
            <div className="p-6 pt-12">
              <div className="text-center mb-6">
                <div className="mx-auto mb-3 p-3 rounded-full bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 w-fit">
                  <ModeIcon className="w-7 h-7 text-emerald-500" />
                </div>
                <h2 id="auth-modal-title" className="text-xl font-bold text-white">
                  {isSignup ? 'Регистрация' : 'Вход'}
                </h2>
                <p className="text-sm text-zinc-400 mt-1">
                  {isSignup
                    ? 'Создайте аккаунт, чтобы начать играть'
                    : 'Рады видеть вас снова'}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
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
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
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
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 shadow h-10 rounded-md px-8 w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSignup ? 'Создать аккаунт' : 'Войти'}
                </button>

                <div className="text-center pt-1 pb-4">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
