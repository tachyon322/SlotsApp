import { PartnerShell } from '@/components/partner/PartnerShell';
import OffersHub from '@/components/partner/OffersHub';
import { partnerApi } from '@/lib/api';
import { getPartnerToken } from './server';

export const dynamic = 'force-dynamic';

export default async function OffersPage() {
  const token = await getPartnerToken();

  if (token) {
    try {
      const me = await partnerApi.me(token);
      return (
        <PartnerShell initialToken={token} initialPartner={me.partner}>
          <OffersHub />
        </PartnerShell>
      );
    } catch {
      // fall through to login / client-side restore
    }
  }

  return (
    <PartnerShell>
      <OffersHub />
    </PartnerShell>
  );
}
