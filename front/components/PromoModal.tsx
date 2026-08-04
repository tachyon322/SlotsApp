'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useUser } from './UserProvider';
import { useAuthModal } from './AuthModal';
import { walletApi } from '@/lib/api';
import { ModalShell } from './ModalShell';

interface PromoModalContextValue {
  openPromo: () => void;
}

const PromoModalContext = createContext<PromoModalContextValue>({
  openPromo: () => {},
});

export function usePromoModal() {
  return useContext(PromoModalContext);
}

export function PromoModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openPromo = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const contextValue = useMemo<PromoModalContextValue>(
    () => ({ openPromo }),
    [openPromo],
  );

  return (
    <PromoModalContext.Provider value={contextValue}>
      {children}
      <PromoModal open={open} onClose={close} />
    </PromoModalContext.Provider>
  );
}

function PromoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useUser();
  const { openAuth } = useAuthModal();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setLoading(false);
      setSuccess(null);
      setError(null);
    }
  }, [open]);

  const handleActivate = async () => {
    if (!code.trim() || loading) return;

    if (!user) {
      openAuth('signin');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await walletApi.activatePromo(code);
      setSuccess(res.message);
      setCode('');
      await refresh();
    } catch (err) {
      setError((err as Error).message || 'Не удалось активировать промокод');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} titleId="promo-modal-title">
      <div className="flex gap-lg flex-col">
        <div className="text-center space-y-sm">
          <h2 id="promo-modal-title" className="text-2xl font-bold text-white">
            Промокод
          </h2>
          <p className="text-sm text-zinc-400">
            Активируйте код для получения бонуса
          </p>
        </div>

        <div className="space-y-sm">
          <div className="relative">
            <input
              placeholder="Введите промокод"
              maxLength={20}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={!user || loading}
              className="w-full px-md py-sm text-lg font-semibold bg-zinc-900 rounded-control border-2 text-white placeholder:text-zinc-600 focus:outline-none border-zinc-800 focus:border-blue-500 focus:ring-blue-500/10 uppercase"
            />
          </div>
        </div>

        {success && (
          <div className="flex items-center gap-xs text-xs text-emerald-400 bg-emerald-500/10 p-xs rounded-control border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-xs text-xs text-red-400 bg-red-500/10 p-xs rounded-control border border-red-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleActivate}
          disabled={!code.trim() || loading || !user}
          className="inline-flex items-center justify-center gap-xs whitespace-nowrap focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-blue-500/25 transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Проверка...</span>
            </>
          ) : (
            'Активировать'
          )}
        </button>

        <div className="text-xs text-zinc-400 text-center">
          Получайте промокоды в{' '}
          <a
            href="https://t.me/promosw_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400 underline hover:text-green-300"
          >
            нашем боте
          </a>
        </div>
      </div>
    </ModalShell>
  );
}
