'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Users,
  Gift,
  TrendingUp,
  Copy,
  Share2,
  ChevronDown,
  User,
  Check,
  Loader2,
} from 'lucide-react';
import { ModalShell } from '@/components/ModalShell';
import { referralApi, type ReferralsStatusResponse } from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

interface InviteFriendsSheetProps {
  open: boolean;
  onClose: () => void;
}

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Tile({
  icon,
  value,
  label,
  tone = 'default',
}: {
  icon: ReactNode;
  value: string;
  label: string;
  tone?: 'default' | 'money';
}) {
  const valueCls =
    tone === 'money' ? 'text-emerald-400' : 'text-white';
  return (
    <div className="flex flex-col items-center gap-1 rounded-panel border border-white/8 bg-white/[0.02] p-3 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <span className={`text-sm font-bold ${valueCls}`}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

export function InviteFriendsSheet({ open, onClose }: InviteFriendsSheetProps) {
  const [status, setStatus] = useState<ReferralsStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    referralApi
      .status()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleCopy = async () => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showError('Не удалось скопировать ссылку');
    }
  };

  const handleShare = async () => {
    if (!status) return;
    const payload = {
      title: 'Приглашай друзей',
      text: `Регистрируйся и получай бонусы — ${status.link}`,
      url: status.link,
    };
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
      } catch {
        // user dismissed share sheet
      }
    } else {
      await handleCopy();
      showSuccess('Ссылка скопирована');
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} titleId="invite-friends-title" maxWidthClass="max-w-[30rem]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-panel border border-blue-500/30 bg-blue-500/15 text-blue-400">
            <Users className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 id="invite-friends-title" className="text-lg font-bold text-white">
              Приглашай друзей
            </h2>
            <p className="text-xs text-muted-foreground">
              Зарабатывай больше с каждым приглашённым другом
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="h-28 animate-pulse rounded-panel bg-white/5" />
            <div className="h-16 animate-pulse rounded-panel bg-white/5" />
          </div>
        ) : status ? (
          <>
            <div className="rounded-panel border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-transparent p-4">
              <span className="text-xs text-muted-foreground">Твоя ссылка приглашения</span>
              <div className="mt-1.5 truncate rounded-button border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-blue-300">
                {status.link}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-button border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-button bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-2 text-xs font-semibold text-white shadow transition-colors hover:from-blue-600 hover:to-blue-700"
                >
                  <Share2 className="h-4 w-4" />
                  Поделиться
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Tile icon={<Users className="h-4 w-4" />} value={String(status.friendsCount)} label="Друзей" />
              <Tile icon={<Gift className="h-4 w-4" />} value={formatRub(status.earned)} label="Заработано" tone="money" />
              <Tile icon={<TrendingUp className="h-4 w-4" />} value={formatRub(status.perFriend)} label="За друга" />
            </div>

            <div className="rounded-panel border border-white/8 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setAccordionOpen((v) => !v)}
                aria-expanded={accordionOpen}
                className="flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-white">Все уровни наград</span>
                  <span className="text-xs text-muted-foreground">
                    За каждого приглашённого друга — {formatRub(status.perFriend)}
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${accordionOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {accordionOpen && (
                <div className="px-4 pb-4">
                  <div className="rounded-button border border-white/5 bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground">
                    {formatRub(status.perFriend)} за каждого друга, который зарегистрируется по вашей
                    ссылке. Награда начисляется сразу после регистрации.
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                  <Users className="h-4 w-4" />
                  Твои друзья
                </span>
                <span className="text-xs text-muted-foreground">
                  {status.friendsCount} {status.friendsCount === 1 ? 'активный' : 'активных'}
                </span>
              </div>

              {status.friends.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {status.friends.map((f) => (
                    <li
                      key={f.createdAt + f.name}
                      className="flex items-center gap-2.5 rounded-button border border-white/8 bg-white/[0.02] p-2.5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-emerald-500/10 text-sm font-semibold text-emerald-400">
                        {f.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-white">{f.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(f.createdAt)}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-emerald-400">
                        +{formatRub(status.perFriend)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 flex flex-col items-center gap-1 rounded-panel border border-dashed border-white/10 p-6 text-center">
                  <User className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-semibold text-white">
                    Вы ещё не пригласили друзей
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Начните приглашать и зарабатывать!
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="rounded-panel border border-white/8 bg-white/[0.02] p-4 text-center text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              Не удалось загрузить данные
            </span>
          </p>
        )}
      </div>
    </ModalShell>
  );
}
