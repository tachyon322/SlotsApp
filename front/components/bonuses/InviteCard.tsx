'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, ChevronRight, Copy } from 'lucide-react';
import type { ReferralsStatusResponse } from '@/lib/api';
import { formatRub, pluralRu } from '@/lib/format';
import { showError } from '@/lib/toast';
import { INVITE_ART } from './art';

interface InviteCardProps {
  referral: ReferralsStatusResponse | null;
  guest: boolean;
  onLogin: () => void;
  /** Открыть шторку со списком приглашённых */
  onDetails: () => void;
}

// Приглашения: сумма за друга, ссылка с копированием и итоги
export function InviteCard({ referral, guest, onLogin, onDetails }: InviteCardProps) {
  const [copied, setCopied] = useState(false);
  const perFriend = referral?.perFriend ?? 500;
  const friends = referral?.friendsCount ?? 0;

  const copy = async () => {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showError('Не удалось скопировать ссылку');
    }
  };

  return (
    <section className="pg-card lb-invite" aria-labelledby="lb-invite-title">
      <Image className="lb-invite-art" src={INVITE_ART} width={160} height={160} alt="" aria-hidden="true" />
      <span className="pg-eyebrow">Друзья</span>
      <h2 id="lb-invite-title">Приглашайте друзей</h2>
      <strong className="lb-invite-sum">{formatRub(perFriend)}</strong>
      <p>за каждого друга, который пополнит баланс</p>

      {guest ? (
        <button type="button" className="pg-btn pg-btn-sec pg-btn-wide lb-invite-login" onClick={onLogin}>
          Войти, чтобы получить ссылку
        </button>
      ) : (
        <>
          <div className="lb-link">
            <code>{referral ? referral.link.replace(/^https?:\/\//, '') : '…'}</code>
            <button
              type="button"
              className="pg-btn pg-btn-acc pg-btn-sm"
              onClick={() => void copy()}
              disabled={!referral}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? 'Готово' : 'Копировать'}
            </button>
          </div>
          <button type="button" className="lb-invite-stats" onClick={onDetails} aria-label="Приглашённые друзья">
            <span>
              <b>{friends}</b>
              {pluralRu(friends, ['друг пришёл', 'друга пришли', 'друзей пришли'])}
            </span>
            <span>
              <b>{formatRub(referral?.earned ?? 0)}</b>
              получено
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        </>
      )}
    </section>
  );
}
