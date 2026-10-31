"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FC } from "react";
import {
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  groupPartByType,
  useAui,
  useAuiState,
  useMessagePartText,
} from "@assistant-ui/react";
import {
  ArrowUpRight,
  CreditCard,
  Gamepad2,
  Gift,
  Loader2,
  MessageCircle,
  Paperclip,
  Send,
  Undo2,
} from "lucide-react";
import { SupportMessageContent } from "@/components/support/SupportMessageContent";
import { supportAttachmentSnippet, uploadSupportFile } from "@/lib/supportAttachments";
import { showError } from "@/lib/toast";
import { useUser } from "@/components/UserProvider";
import { useRefundModal } from "@/components/RefundModal";
import { walletApi, type RefundStatusResponse } from "@/lib/api";

/**
 * Лента переписки и композер страницы поддержки (su-*).
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
  return <SupportMessageContent content={part.text} />;
};

// Ошибка запроса — показывается вместо пустого сообщения.
const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="su-msg-error">
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
      className="su-msg"
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
                <span className="su-typing" aria-label="Оператор подключается">
                  <span className="su-typing-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  Оператор подключается к диалогу, время ожидания до 30 секунд.
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

const Composer: FC<{ label?: string }> = ({ label = "Поддержка" }) => {
  const aui = useAui();
  const { user } = useUser();
  const { openRefund } = useRefundModal();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [refundStatus, setRefundStatus] = useState<RefundStatusResponse | null>(null);

  const loadRefundStatus = useCallback(async () => {
    if (!user) {
      setRefundStatus(null);
      return;
    }
    try {
      setRefundStatus(await walletApi.refundStatus());
    } catch {
      setRefundStatus(null);
    }
  }, [user]);

  useEffect(() => {
    void loadRefundStatus();
  }, [loadRefundStatus]);

  useEffect(() => {
    const onRefundCreated = () => void loadRefundStatus();
    window.addEventListener("refund-created", onRefundCreated);
    return () => window.removeEventListener("refund-created", onRefundCreated);
  }, [loadRefundStatus]);

  // Кнопка видна только тем, у кого есть успешный депозит и нет заявки в обработке.
  const canRefund =
    Boolean(refundStatus?.eligible) && refundStatus?.request?.status !== "pending";

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploading(true);
    try {
      const { publicUrl, kind, name } = await uploadSupportFile(file);
      const current = aui.composer.getState().text;
      const snippet = supportAttachmentSnippet(publicUrl, kind, name);
      aui.composer.setText(current ? `${current}\n${snippet}` : snippet);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ComposerPrimitive.Root
      className="su-composer"
    >
      <ComposerPrimitive.Input
        aria-label={`Сообщение в ${label}`}
        maxLength={2000}
        placeholder="Напишите сообщение…"
        rows={1}
        enterKeyHint="send"
      />
      {canRefund && (
        <button
          type="button"
          className="su-composer-refund"
          aria-label="Заявка на возврат средств"
          title="Вернуть средства"
          onClick={openRefund}
        >
          <Undo2 aria-hidden="true" />
          <span>Возврат</span>
        </button>
      )}
      <button
        type="button"
        className="su-composer-icon"
        aria-label="Прикрепить скриншот или файл"
        title="Прикрепить скриншот или PDF"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Paperclip aria-hidden="true" />
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
        className="sr-only"
        disabled={isUploading}
        onChange={(e) => void handleFile(e)}
      />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send
          render={
            <button
              type="button"
              className="su-composer-send"
              aria-label="Отправить сообщение"
            />
          }
        >
          <Send aria-hidden="true" />
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <button
          type="button"
          className="su-composer-send"
          disabled
          aria-label="Оператор печатает"
        >
          <Send aria-hidden="true" />
        </button>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
};

// Быстрые темы для пустого диалога — отправляются сразу, ассистент уточнит детали.
const TOPICS = [
  { icon: CreditCard, label: "Не пришло пополнение", prompt: "Не пришло пополнение" },
  { icon: ArrowUpRight, label: "Статус вывода", prompt: "Где мой вывод средств?" },
  { icon: Gift, label: "Бонусы и промокоды", prompt: "Вопрос по бонусам и промокодам" },
  { icon: Gamepad2, label: "Проблема в игре", prompt: "Проблема в игре" },
];

const Welcome: FC = () => (
  <div className="su-welcome">
    <span className="su-welcome-icon">
      <MessageCircle aria-hidden="true" />
    </span>
    <strong>Чем можем помочь?</strong>
    <span>Опишите вопрос своими словами или выберите тему.</span>
    <div className="su-topics">
      {TOPICS.map(({ icon: Icon, label, prompt }) => (
        <ThreadPrimitive.Suggestion
          key={label}
          prompt={prompt}
          send
          className="su-topic"
        >
          <Icon aria-hidden="true" />
          {label}
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
  </div>
);

export type SupportFeedProps = {
  /** Отображаемое название или номер чата */
  label?: string;
};

export const SupportFeed: FC<SupportFeedProps> = ({ label = "Поддержка" }) => {
  const feedRef = useRef<HTMLDivElement>(null);
  const messageCount = useAuiState((s) => s.thread.messages.length);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  // Автоскролл ленты при появлении сообщений и старте ответа.
  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messageCount, isRunning]);

  return (
    <>
      <div
        ref={feedRef}
        className="su-feed"
        aria-live="polite"
        aria-label={`Переписка ${label}`}
      >
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <Welcome />
        </AuiIf>
        <ThreadPrimitive.Messages>{() => <SupportMessage />}</ThreadPrimitive.Messages>
      </div>
      <Composer label={label} />
    </>
  );
};
