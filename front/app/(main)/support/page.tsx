"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronRight,
  Headset,
  HeartHandshake,
  HelpCircle,
  ScrollText,
  ShieldCheck,
  UserRound,
  Zap,
} from "lucide-react";
import { useUser } from "@/components/UserProvider";
import { useAuthModal } from "@/components/AuthModal";
import { supportApi, type SupportMessageItem } from "@/lib/api";
import { Assistant } from "@/app/assistant";
import { SupportFeed } from "@/components/support/SupportFeed";

const POINTS = [
  { icon: Zap, title: "Ответ за минуту", text: "Ассистент на связи круглосуточно" },
  { icon: UserRound, title: "Живой оператор", text: "К вашим вопросам подключается человек" },
  { icon: ShieldCheck, title: "Видит ваш аккаунт", text: "Баланс, депозиты, выводы и историю игр" },
];

const LINKS = [
  { href: "/faq", icon: HelpCircle, label: "Частые вопросы" },
  { href: "/rules", icon: ScrollText, label: "Правила" },
  { href: "/responsible", icon: HeartHandshake, label: "Ответственная игра" },
];

function SupportHead() {
  return (
    <header className="pg-head su-head">
      <h1>Поддержка</h1>
      <span className="pg-pill pg-pill-live">
        <i className="su-dot" aria-hidden="true" />
        Онлайн 24/7
      </span>
    </header>
  );
}

// Боковая колонка: как устроена поддержка и полезные ссылки
function SupportAside() {
  return (
    <aside className="su-side">
      <section className="pg-card su-about" aria-labelledby="su-about-title">
        <span id="su-about-title" className="pg-eyebrow">
          Как мы помогаем
        </span>
        <ul className="su-points">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <span className="su-point-icon">
                <Icon aria-hidden="true" />
              </span>
              <div>
                <b>{title}</b>
                <span>{text}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <nav className="pg-card su-links" aria-label="Полезные разделы">
        {LINKS.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <ChevronRight aria-hidden="true" className="su-links-arrow" />
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export default function SupportPage() {
  const { user, isLoading } = useUser();
  const { openAuth } = useAuthModal();

  if (isLoading) {
    return <SupportLoading />;
  }

  if (!user) {
    return (
      <div className="su" data-view="guest">
        <SupportHead />
        <div className="su-grid">
          <section className="pg-card su-guest">
            <span className="su-guest-art">
              <Headset aria-hidden="true" />
            </span>
            <strong>Войдите, чтобы написать нам</strong>
            <span>
              Так ассистент увидит ваш баланс, транзакции, депозиты и историю
              игр и сможет помочь с ними.
            </span>
            <div className="su-guest-actions">
              <button
                type="button"
                className="pg-btn pg-btn-acc"
                onClick={() => openAuth("signin")}
              >
                Войти
              </button>
              <button
                type="button"
                className="pg-btn pg-btn-sec"
                onClick={() => openAuth("signup")}
              >
                Зарегистрироваться
              </button>
            </div>
          </section>
          <SupportAside />
        </div>
      </div>
    );
  }

  return <SupportChat />;
}

function SupportLoading() {
  return (
    <div className="su" data-view="chat">
      <SupportHead />
      <div className="su-grid" aria-hidden="true">
        <div className="pg-skel su-skel-chat" />
        <div className="su-side">
          <div className="pg-skel su-skel-side" />
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
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setState(null);
    supportApi
      .thread()
      .then((data) => {
        setState({ conversationId: data.conversationId, items: data.items });
      })
      .catch((err) => {
        console.error("[support] failed to load thread:", err);
        setError(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="su" data-view="chat">
        <SupportHead />
        <div className="pg-card pg-empty">
          <AlertCircle aria-hidden="true" className="pg-empty-icon" />
          <strong>Не удалось загрузить переписку</strong>
          <span>Проверьте соединение и попробуйте ещё раз.</span>
          <button type="button" className="pg-btn pg-btn-acc" onClick={load}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return <SupportLoading />;
  }

  return (
    <div className="su" data-view="chat">
      <SupportHead />
      <div className="su-grid">
        <section className="pg-card su-chat" aria-label="Чат с поддержкой">
          <header className="su-chat-head">
            <span className="su-avatar">
              <Headset aria-hidden="true" />
              <i aria-hidden="true" />
            </span>
            <div>
              <b>Чат с поддержкой</b>
              <span>Ассистент и операторы на связи</span>
            </div>
          </header>
          <Assistant
            conversationId={state.conversationId}
            initialItems={state.items}
          >
            <SupportFeed label="Поддержка" />
          </Assistant>
        </section>
        <SupportAside />
      </div>
    </div>
  );
}
