"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";
import { useAuthModal } from "@/components/AuthModal";
import { Headset, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { supportApi, type SupportMessageItem } from "@/lib/api";

const Assistant = dynamic(
  () => import("@/app/assistant").then((m) => m.Assistant),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center p-page animate-pulse">
        <div className="flex flex-col items-center gap-sm">
          <div className="h-14 w-14 rounded-panel bg-white/5" />
          <div className="h-4 w-40 rounded bg-white/5" />
        </div>
      </div>
    ),
  },
);

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

  return <SupportChat />;
}

function SupportChat() {
  const [state, setState] = useState<{
    conversationId: string;
    items: SupportMessageItem[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setState(null);
    supportApi
      .thread()
      .then((data) => {
        setState({ conversationId: data.conversationId, items: data.items });
      })
      .catch((err) => {
        console.error("[support] failed to load thread:", err);
        setError(
          (err as Error).message || "Не удалось загрузить историю диалога",
        );
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-page">
        <div className="flex max-w-[24rem] flex-col items-center gap-sm text-center">
          <Headset className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Не удалось загрузить историю диалога. Повторите попытку, чтобы
            продолжить переписку.
          </p>
          <button
            onClick={load}
            className="inline-flex h-9 items-center gap-1.5 rounded-control bg-gradient-to-r from-blue-500 to-blue-600 px-sm text-xs font-medium text-white transition-colors hover:from-blue-600 hover:to-blue-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center p-page animate-pulse">
        <div className="flex flex-col items-center gap-sm">
          <div className="h-14 w-14 rounded-panel bg-white/5" />
          <div className="h-4 w-40 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-4rem)] md:h-dvh">
      <Assistant conversationId={state.conversationId} initialItems={state.items} />
    </div>
  );
}
