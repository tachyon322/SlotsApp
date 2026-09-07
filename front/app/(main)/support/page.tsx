"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Headset, Loader2, Plus, Send, X } from "lucide-react";
import { useUser } from "@/components/UserProvider";
import { useAuthModal } from "@/components/AuthModal";
import {
  supportApi,
  type SupportConversation,
  type SupportConversationStatus,
  type SupportMessageItem,
} from "@/lib/api";
import { Assistant } from "@/app/assistant";
import { SupportFeed } from "@/components/support/SupportFeed";

const MAX_ISSUE_LENGTH = 2000;

// Категории нового обращения (тема) — как в референсе.
const CATEGORIES = ["Пополнение", "Вывод", "Игра", "Аккаунт", "Другое"] as const;

function statusLabel(status: SupportConversationStatus): string {
  if (status === "pending_user") return "Нужен ваш ответ";
  if (status === "closed") return "Закрыто";
  return "В обработке";
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function ticketLabel(conv: SupportConversation): string {
  return conv.code || conv.id.slice(0, 9).toUpperCase();
}

export default function SupportPage() {
  const { user, isLoading } = useUser();
  const { openAuth } = useAuthModal();

  if (isLoading) {
    return <SupportLoading />;
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

  return <SupportDesk />;
}

function SupportLoading() {
  return (
    <div className="sp-supportInitialLoading" aria-hidden="true">
      <div className="sp-loadingHero">
        <div className="sp-heroCopy">
          <span className="sp-eyebrow">Загрузка</span>
          <h1>Загрузка</h1>
          <p>Загрузка</p>
        </div>
      </div>
      <div className="sp-loadingDesk">
        <i />
        <i />
      </div>
    </div>
  );
}

function SupportDesk() {
  const [conversations, setConversations] = useState<SupportConversation[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, SupportMessageItem[]>>({});

  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [issueText, setIssueText] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);

  const loadedIds = useRef<Set<string>>(new Set());

  const loadConversations = useCallback(async () => {
    try {
      const data = await supportApi.conversations();
      setConversations(data.items);
      setListError(null);
      return data.items;
    } catch (err) {
      console.error("[support] failed to load conversations:", err);
      setListError((err as Error).message || "Не удалось загрузить обращения");
      return null;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const items = await loadConversations();
      // По умолчанию открываем самое свежее обращение (или форму новой темы).
      if (items && items.length > 0) setSelectedId(items[0].id);
    })();
  }, [loadConversations]);

  // Периодическое обновление списка (статусы/время).
  useEffect(() => {
    const timer = setInterval(() => void loadConversations(), 30_000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  // История выбранного обращения загружается до монтирования чата.
  useEffect(() => {
    if (!selectedId || loadedIds.current.has(selectedId)) return;
    loadedIds.current.add(selectedId);
    supportApi
      .messages(selectedId)
      .then((data) => {
        setMessages((prev) => ({ ...prev, [selectedId]: data.items }));
      })
      .catch(() => {
        setMessages((prev) => ({ ...prev, [selectedId]: [] }));
      });
  }, [selectedId]);

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;
  const hasActive = (conversations ?? []).some((c) => c.status !== "closed");

  const handleCreate = async () => {
    const text = issueText.trim();
    if (!text || creating) return;
    setCreating(true);
    setFormError(null);
    try {
      const conv = await supportApi.createConversation(category);
      setConversations((prev) => [conv, ...(prev ?? [])]);
      setMessages((prev) => ({ ...prev, [conv.id]: [] }));
      loadedIds.current.add(conv.id);
      setSelectedId(conv.id);
      setPendingDraft(text);
      setIssueText("");
      void loadConversations();
    } catch (err) {
      const message = (err as Error).message || "Не удалось создать обращение";
      setFormError(message);
      void loadConversations();
    } finally {
      setCreating(false);
    }
  };

  const handleClose = async () => {
    if (!selected || closing || selected.status === "closed") return;
    setClosing(true);
    try {
      await supportApi.closeConversation(selected.id);
      setConversations((prev) =>
        (prev ?? []).map((c) =>
          c.id === selected.id
            ? { ...c, status: "closed" as const, updatedAt: new Date().toISOString() }
            : c,
        ),
      );
      void loadConversations();
    } catch {
      // Оставляем статус как есть — список обновится по таймеру.
      void loadConversations();
    } finally {
      setClosing(false);
    }
  };

  const hero = (
    <header className="sp-hero">
      <div className="sp-heroCopy">
        <span className="sp-eyebrow">СВЯЗЬ С ПОДДЕРЖКОЙ</span>
        <h1>Поддержка</h1>
        <p>Напишите оператору — ответы и статус обращения сохранятся в этом разделе.</p>
      </div>
    </header>
  );

  if (conversations === null && listError) {
    return (
      <div className="sp-supportSurface">
        {hero}
        <div className="sp-desk" data-ticket-selected="false">
          <aside className="sp-ticketList" aria-label="Мои обращения">
            <div className="sp-listHeading">
              <div>
                <span>ОБРАЩЕНИЯ</span>
                <strong>Мои обращения</strong>
              </div>
            </div>
            <p className="sp-listNotice">
              Не удалось загрузить обращения.{" "}
              <button type="button" onClick={() => void loadConversations()}>
                Повторить
              </button>
            </p>
          </aside>
          <div className="sp-detailPanel" data-detail="new">
            <NewTicketForm
              category={category}
              onCategory={setCategory}
              issueText={issueText}
              onIssueText={setIssueText}
              creating={creating}
              formError={formError}
              onCreate={() => void handleCreate()}
            />
          </div>
        </div>
      </div>
    );
  }

  if (conversations === null) {
    return <SupportLoading />;
  }

  return (
    <div className="sp-supportSurface">
      {hero}
      <div className="sp-desk" data-ticket-selected={selected ? "true" : "false"}>
        <aside className="sp-ticketList" aria-label="Мои обращения">
          <div className="sp-listHeading">
            <div>
              <span>ОБРАЩЕНИЯ</span>
              <strong>Мои обращения</strong>
            </div>
            <button
              type="button"
              className="sp-newIcon"
              aria-label="Новое обращение"
              aria-disabled={hasActive}
              data-disabled={hasActive}
              aria-describedby="support-new-request-availability"
              onClick={() => {
                if (!hasActive) setSelectedId(null);
              }}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>

          {conversations.length === 0 && (
            <div className="sp-emptyHistory">
              <span>История появится здесь.</span>
            </div>
          )}

          <div className="sp-ticketItems">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                type="button"
                className="sp-ticketItem"
                data-selected={conv.id === selectedId}
                onClick={() => setSelectedId(conv.id)}
              >
                <span className="sp-ticketItemTop">
                  <span>{conv.subject}</span>
                  <time>{formatDay(conv.updatedAt)}</time>
                </span>
                <span className="sp-ticketItemBottom">
                  <strong>{ticketLabel(conv)}</strong>
                  <span data-status={conv.status}>{statusLabel(conv.status)}</span>
                  <ChevronRight aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>

          {hasActive && (
            <span id="support-new-request-availability" className="sp-activeHint">
              У вас уже есть активное обращение
            </span>
          )}
        </aside>

        {selected ? (
          <div className="sp-detailPanel" data-detail="thread">
            <div className="sp-threadHeader">
              <button
                type="button"
                className="sp-backButton"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft aria-hidden="true" /> Назад к обращениям
              </button>
              <div>
                <strong>{ticketLabel(selected)}</strong>
                <span data-status={selected.status}>{statusLabel(selected.status)}</span>
              </div>
              <button
                type="button"
                className="sp-closeButton"
                onClick={() => void handleClose()}
                disabled={closing || selected.status === "closed"}
              >
                <X aria-hidden="true" /> Закрыть
              </button>
            </div>
            {messages[selected.id] ? (
              <Assistant
                key={selected.id}
                conversationId={selected.id}
                initialItems={messages[selected.id]}
                draft={pendingDraft}
                onDraftConsumed={() => setPendingDraft(null)}
              >
                <SupportFeed
                  label={ticketLabel(selected)}
                  closed={selected.status === "closed"}
                />
              </Assistant>
            ) : (
              <div className="sp-threadActionSlot" aria-hidden="true" />
            )}
          </div>
        ) : (
          <div className="sp-detailPanel" data-detail="new">
            <NewTicketForm
              category={category}
              onCategory={setCategory}
              issueText={issueText}
              onIssueText={setIssueText}
              creating={creating}
              formError={formError}
              onCreate={() => void handleCreate()}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface NewTicketFormProps {
  category: string;
  onCategory: (value: string) => void;
  issueText: string;
  onIssueText: (value: string) => void;
  creating: boolean;
  formError: string | null;
  onCreate: () => void;
}

function NewTicketForm({
  category,
  onCategory,
  issueText,
  onIssueText,
  creating,
  formError,
  onCreate,
}: NewTicketFormProps) {
  return (
    <>
      <div className="sp-detailIntro">
        <span>ПОДДЕРЖКА</span>
        <h2>Новое обращение</h2>
        <p>Выберите тему и опишите проблему — обращение появится в истории.</p>
      </div>

      <div className="sp-categoryPicker" role="radiogroup" aria-label="Категория обращения">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={item === category}
            onClick={() => onCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <textarea
        className="sp-issueInput"
        aria-label="Текст обращения"
        maxLength={MAX_ISSUE_LENGTH}
        placeholder="Опишите проблему как можно подробнее…"
        value={issueText}
        onChange={(event) => onIssueText(event.target.value)}
      />

      {formError && <p className="sp-errorMessage">{formError}</p>}

      <div className="sp-formFooter">
        <span>
          {issueText.length} / {MAX_ISSUE_LENGTH}
        </span>
        <button
          type="button"
          className="sp-primaryAction"
          onClick={onCreate}
          disabled={creating || issueText.trim().length === 0}
        >
          {creating && <Loader2 aria-hidden="true" />}
          Отправить обращение
          <Send aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
