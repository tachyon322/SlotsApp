import { PartnerShell } from '@/components/partner/PartnerShell';
import ReferralsClient from '@/components/partner/ReferralsClient';
import { partnerApi } from '@/lib/api';
import { getPartnerToken } from '../server';

export const dynamic = 'force-dynamic';

export default async function ReferralsPage() {
  const token = await getPartnerToken();

  if (token) {
    try {
      const [me, referrals] = await Promise.all([partnerApi.me(token), partnerApi.referrals(token)]);
      return (
        <PartnerShell initialToken={token} initialPartner={me.partner}>
          <ReferralsClient
            initialLoaded
            initialItems={referrals.items}
            initialSum={referrals.sum}
          />
        </PartnerShell>
      );
    } catch {
      // fall through to login / client-side restore
    }
  }

  return (
    <PartnerShell>
      <ReferralsClient />
    </PartnerShell>
  );
}
