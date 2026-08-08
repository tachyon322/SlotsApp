"use client";

import { useUser } from "@/components/UserProvider";
import { useAuthModal } from "@/components/AuthModal";
import { Headset } from "lucide-react";
import { Assistant } from "@/app/assistant";

export default function SupportPage() {
  const { user, isLoading } = useUser();
  const { openAuth } = useAuthModal();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-page animate-pulse">
        <div className="flex flex-col items-center gap-sm">
          <div className="h-14 w-14 rounded-panel bg-white/5" />
          <div className="h-4 w-40 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-page">
        <div className="w-full max-w-[28rem] rounded-panel border border-sidebar-border bg-card p-xl text-center">
          <div className="mx-auto mb-md flex h-14 w-14 items-center justify-center rounded-panel bg-emerald-500/10">
            <Headset className="h-7 w-7 text-emerald-400" />
          </div>
          <h1 className="text-lg font-bold text-sidebar-foreground">
            Техническая поддержка
          </h1>
          <p className="mt-xs text-sm text-muted-foreground">
            Войдите в аккаунт, чтобы бот мог видеть ваш баланс, транзакции,
            депозиты и историю игр и помочь с ними.
          </p>
          <div className="mt-lg flex flex-col gap-xs">
            <button
              onClick={() => openAuth("signin")}
              className="inline-flex h-9 items-center justify-center rounded-control bg-gradient-to-r from-blue-500 to-blue-600 px-sm text-xs font-medium text-white transition-colors hover:from-blue-600 hover:to-blue-700"
            >
              Войти
            </button>
            <button
              onClick={() => openAuth("signup")}
              className="inline-flex h-9 items-center justify-center rounded-control px-sm text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              Зарегистрироваться
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-4rem)] md:h-dvh">
      <Assistant />
    </div>
  );
}
