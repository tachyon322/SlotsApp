'use client';

import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { LgSheet } from '@/components/ui/LgSheet';
import { ReferralInvitePanel, shareReferralLink } from '@/components/referral/ReferralInvitePanel';
import { referralApi, type ReferralsStatusResponse } from '@/lib/api';

interface InviteFriendsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function InviteFriendsSheet({ open, onClose }: InviteFriendsSheetProps) {
  const [status, setStatus] = useState<ReferralsStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Скролл body и Escape (раньше это делал ModalShell)
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <LgSheet
      titleId="invite-friends-title"
      title="Друзья"
      onClose={onClose}
      state={loading ? 'loading' : status ? 'ready' : 'error'}
      footer={
        <button
          type="button"
          className="pg-btn pg-btn-acc"
          disabled={!status}
          onClick={() => status && void shareReferralLink(status.link)}
        >
          <Share2 aria-hidden="true" />
          Поделиться ссылкой
        </button>
      }
    >
      <ReferralInvitePanel status={status} loading={loading} />
    </LgSheet>
  );
}
