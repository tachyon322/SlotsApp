'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, Copy, Link2 } from 'lucide-react';
import type { ReferralsStatusResponse } from '@/lib/api';
import { formatRub, pluralRu } from '@/lib/format';
import { showError, showSuccess } from '@/lib/toast';
import { INVITE_ART } from '@/components/bonuses/art';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function copyLink(link: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    showError('Не удалось скопировать ссылку');
    return false;
  }
}

/** «Поделиться» системным меню; без него — копирование ссылки. */
export async function shareReferralLink(link: string): Promise<void> {
  const payload = {
    title: 'Приглашай друзей',
    text: `Регистрируйся и получай бонусы — ${link}`,
    url: link,
  };
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(payload);
    } catch {
      // user dismissed share sheet
    }
  } else if (await copyLink(link)) {
    showSuccess('Ссылка скопирована');
  }
}

export function ReferralInvitePanel({
  status,
  loading,
}: {
  status: ReferralsStatusResponse | null;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!status) return;
    if (await copyLink(status.link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="ls-inv-skel" aria-busy="true">
        <i style={{ height: 172 }} />
        <i style={{ height: 52 }} />
        <i style={{ height: 76 }} />
      </div>
    );
  }

  if (!status) {
    return <p className="ls-inv-fail">Не удалось загрузить данные</p>;
  }

  return (
    <>
      <div className="ls-inv-hero">
        <Image src={INVITE_ART} alt="" width={108} height={108} aria-hidden="true" />
        <small>За каждого друга</small>
        <strong>{formatRub(status.perFriend)}</strong>
        <p>Начисляем сразу, как друг зарегистрируется по вашей ссылке</p>
        <div className="ls-inv-stats">
          <div>
            <b>{status.friendsCount}</b>
            <span>{pluralRu(status.friendsCount, ['друг пришёл', 'друга пришли', 'друзей пришли'])}</span>
          </div>
          <div>
            <b>{formatRub(status.earned)}</b>
            <span>получено</span>
          </div>
        </div>
      </div>

      <div className="ls-inv-link">
        <Link2 aria-hidden="true" />
        <code>{status.link.replace(/^https?:\/\//, '')}</code>
        <button type="button" className="pg-btn pg-btn-sec pg-btn-sm" onClick={() => void handleCopy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Готово' : 'Копировать'}
        </button>
      </div>

      <ol className="ls-inv-how">
        <li>
          <i>1</i>
          <span>Отправьте ссылку другу</span>
        </li>
        <li>
          <i>2</i>
          <span>Друг регистрируется</span>
        </li>
        <li>
          <i>3</i>
          <span>+{formatRub(status.perFriend)} вам сразу</span>
        </li>
      </ol>

      <div className="ls-inv-title">
        <b>Ваши друзья</b>
        <span>{status.friendsCount}</span>
      </div>

      {status.friends.length > 0 ? (
        <ul className="ls-inv-list">
          {status.friends.map((f) => (
            <li key={f.createdAt + f.name}>
              <i aria-hidden="true">{f.name.charAt(0).toUpperCase()}</i>
              <div>
                <b>{f.name}</b>
                <span>{formatDate(f.createdAt)}</span>
              </div>
              <em>+{formatRub(status.perFriend)}</em>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ls-inv-empty">
          <b>Пока никого</b>
          <span>Отправьте ссылку — первый друг принесёт {formatRub(status.perFriend)}</span>
        </div>
      )}
    </>
  );
}
