"use client";

import { useCallback, useEffect, useState } from "react";
import { Headset, RefreshCw } from "lucide-react";
import { useUser } from "@/components/UserProvider";
import { useAuthModal } from "@/components/AuthModal";
import { supportApi, type SupportMessageItem } from "@/lib/api";
import { Assistant } from "@/app/assistant";
import { SupportFeed } from "@/components/support/SupportFeed";

export default function SupportPage() {
  const { user, isLoading } = useUser();
  const { openAuth } = useAuthModal();

  if (isLoading) {
    return <SupportLoading />;
  }

  if (!user) {
    return (
      <div className="sp-supportSurface">
        <header className="sp-hero">
          <div className="sp-heroCopy">
            <span className="sp-eyebrow">СВЯЗЬ С ПОДДЕРЖКОЙ</span>
            <h1>Поддержка</h1>
            <p>Напишите оператору — наш ассистент и специалисты всегда на связи.</p>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[28rem] rounded-panel border border-sidebar-border bg-card p-xl text-center shadow-lg">
            <div className="mx-auto mb-md flex h-14 w-14 items-center justify-center rounded-panel bg-emerald-500/10">
              <Headset className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold text-sidebar-foreground">
              Техническая поддержка
            </h2>
            <p className="mt-xs text-sm text-muted-foreground">
              Войдите в аккаунт, чтобы бот мог видеть ваш баланс, транзакции,
              депозиты и историю игр и помочь с ними.
            </p>
            <div className="mt-lg flex flex-col gap-xs">
              <button
                type="button"
                onClick={() => openAuth("signin")}
                className="inline-flex h-9 items-center justify-center rounded-control bg-gradient-to-r from-blue-500 to-blue-600 px-sm text-xs font-medium text-white transition-colors hover:from-blue-600 hover:to-blue-700"
              >
                Войти
              </button>
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="inline-flex h-9 items-center justify-center rounded-control px-sm text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
              >
                Зарегистрироваться
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <SupportChat />;
}

function SupportLoading() {
  return (
    <div className="sp-supportSurface">
      <div className="sp-supportInitialLoading" aria-hidden="true">
        <div className="sp-loadingHero">
          <div className="sp-heroCopy">
            <span className="sp-eyebrow">Загрузка</span>
            <h1>Загрузка</h1>
            <p>Загрузка</p>
          </div>
        </div>
        <div className="sp-loadingDesk" data-single-thread="true">
          <i />
        </div>
      </div>
    </div>
  );
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
      <div className="sp-supportSurface">
        <header className="sp-hero">
          <div className="sp-heroCopy">
            <span className="sp-eyebrow">СВЯЗЬ С ПОДДЕРЖКОЙ</span>
            <h1>Поддержка</h1>
            <p>Напишите оператору — наш ассистент и специалисты всегда на связи.</p>
          </div>
        </header>

        <div className="sp-desk" data-single-thread="true">
          <div className="flex flex-1 flex-col items-center justify-center gap-sm p-page text-center">
            <Headset className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Не удалось загрузить историю диалога. Повторите попытку, чтобы
              продолжить переписку.
            </p>
            <button
              type="button"
              onClick={load}
              className="sp-primaryAction mt-2"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Повторить
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!state) {
    return <SupportLoading />;
  }

  return (
    <div className="sp-supportSurface">
      <header className="sp-hero">
        <div className="sp-heroCopy">
          <span className="sp-eyebrow">СВЯЗЬ С ПОДДЕРЖКОЙ</span>
          <h1>Поддержка</h1>
          <p>Напишите оператору — наш ассистент и специалисты всегда на связи.</p>
        </div>
      </header>

      <div className="sp-desk" data-single-thread="true">
        <div className="sp-detailPanel" data-detail="thread">
          <div className="sp-threadHeader">
            <div>
              <strong>Чат с поддержкой</strong>
              <span data-status="open">24/7 Онлайн</span>
            </div>
          </div>
          <Assistant
            conversationId={state.conversationId}
            initialItems={state.items}
          >
            <SupportFeed label="Поддержка" />
          </Assistant>
        </div>
      </div>
    </div>
  );
}
