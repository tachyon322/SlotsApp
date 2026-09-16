'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { ModalShell } from '@/components/ModalShell';
import { ReferralInvitePanel } from '@/components/referral/ReferralInvitePanel';
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

        <ReferralInvitePanel status={status} loading={loading} />
      </div>
    </ModalShell>
  );
}
