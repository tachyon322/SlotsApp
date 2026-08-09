import { PartnerShell } from '@/components/partner/PartnerShell';
import Payout from '@/components/partner/PayoutClient';
import { partnerApi } from '@/lib/api';
import { getPartnerToken } from '../server';

export const dynamic = 'force-dynamic';

export default async function PayoutPage() {
  const token = await getPartnerToken();

  if (token) {
    try {
      const me = await partnerApi.me(token);
      return (
        <PartnerShell initialToken={token} initialPartner={me.partner}>
          <Payout />
        </PartnerShell>
      );
    } catch {
      // fall through to login / client-side restore
    }
  }

  return (
    <PartnerShell>
      <Payout />
    </PartnerShell>
  );
}
