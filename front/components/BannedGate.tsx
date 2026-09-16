'use client';

import type { ReactNode } from 'react';
import { Ban } from 'lucide-react';
import { useUser } from './UserProvider';

export function BannedGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useUser();

  // Пока профиль не загружен, отдаём контент как обычно — иначе заглушка
  // мигала бы каждому гостю и ломала бы SSR-разметку.
  if (!isLoading && user?.banned) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-page py-2xl">
        <div className="w-full max-w-[28rem] rounded-panel border border-red-500/20 bg-white/[0.02] p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill border border-red-500/25 bg-red-500/10">
            <Ban className="h-7 w-7 text-red-400" />
          </span>
          <h1 className="mt-4 font-unbounded text-2xl font-bold text-white">Забанен</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ваш аккаунт заблокирован. Доступ к играм, пополнению и выводу закрыт.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
