"use client";

import { useEffect, useRef, type FC } from "react";
import {
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  groupPartByType,
  useAuiState,
  useMessagePartText,
} from "@assistant-ui/react";
import { Send } from "lucide-react";

/**
 * Лента переписки и композер в разметке support-референса (sp-*).
 * Рендерится внутри AssistantRuntimeProvider (см. app/assistant.tsx children).
 */

function formatTime(value: Date | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

// Реактивный текст части сообщения (обновляется во время стриминга).
const MessageText: FC = () => {
  const part = useMessagePartText();
  if (part.type !== "text") return null;
  return <p>{part.text}</p>;
};

// Ошибка запроса — показывается вместо пустого сообщения.
const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="sp-errorMessage">
        <ErrorPrimitive.Message />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const SupportMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  const createdAt = useAuiState((s) => s.message.createdAt);

  return (
    <MessagePrimitive.Root
      className="sp-message"
      data-role={role === "user" ? "user" : "admin"}
    >
      <MessagePrimitive.GroupedParts groupBy={groupPartByType({})}>
        {({ part }) => {
          switch (part.type) {
            case "text":
              return <MessageText />;
            case "reasoning":
            case "tool-call":
              // Инструменты выполняются скрытно — в ленте не рендерятся.
              return null;
            case "indicator":
              return (
                <span aria-label="Оператор печатает">
                  {"●"}
                </span>
              );
            default:
              return null;
          }
        }}
      </MessagePrimitive.GroupedParts>
      <MessageError />
      <time>{formatTime(createdAt)}</time>
    </MessagePrimitive.Root>
  );
};

const Composer: FC<{ label: string }> = ({ label }) => {
  return (
    <ComposerPrimitive.Root
      className="sp-composer"
      data-support-mobile-composer="true"
    >
      <ComposerPrimitive.Input
        aria-label={`Сообщение в обращение ${label}`}
        maxLength={2000}
        placeholder="Напишите сообщение…"
        rows={1}
        enterKeyHint="send"
      />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send
          render={<button type="button" aria-label="Отправить сообщение" />}
        >
          <Send aria-hidden="true" />
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <button type="button" disabled aria-label="Оператор печатает">
          <Send aria-hidden="true" />
        </button>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
};

export type SupportFeedProps = {
  /** Отображаемый номер обращения (для aria-label композера). */
  label: string;
  /** Обращение закрыто — композер неактивен. */
  closed?: boolean;
};

export const SupportFeed: FC<SupportFeedProps> = ({ label, closed = false }) => {
  const feedRef = useRef<HTMLDivElement>(null);
  const messageCount = useAuiState((s) => s.thread.messages.length);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  // Автоскролл ленты при появлении сообщений и старте ответа.
  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messageCount, isRunning]);

  if (closed) {
    return (
      <>
        <div
          ref={feedRef}
          className="sp-messageFeed"
          aria-live="polite"
          aria-label={`Переписка ${label}`}
        >
          <ThreadPrimitive.Messages>{() => <SupportMessage />}</ThreadPrimitive.Messages>
        </div>
        <div className="sp-threadActionSlot">
          <div className="sp-composer" data-support-mobile-composer="true">
            <textarea
              aria-label={`Сообщение в обращение ${label}`}
              maxLength={2000}
              placeholder="Обращение закрыто"
              disabled
              rows={1}
            />
            <button type="button" disabled aria-label="Обращение закрыто">
              <Send aria-hidden="true" />
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div
        ref={feedRef}
        className="sp-messageFeed"
        aria-live="polite"
        aria-label={`Переписка ${label}`}
      >
        <ThreadPrimitive.Messages>{() => <SupportMessage />}</ThreadPrimitive.Messages>
      </div>
      <div className="sp-threadActionSlot">
        <Composer label={label} />
      </div>
    </>
  );
};
