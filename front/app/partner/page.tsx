import { PartnerShell } from '@/components/partner/PartnerShell';
import OffersClient from '@/components/partner/OffersClient';
import { partnerApi } from '@/lib/api';
import { getPartnerToken } from './server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function OffersPage() {
  const token = await getPartnerToken();

  if (token) {
    try {
      const [me, g, r, c, s] = await Promise.all([
        partnerApi.me(token),
        partnerApi.groups(token),
        partnerApi.redirects(token),
        partnerApi.config(token),
        partnerApi.sources(token, { limit: PAGE_SIZE, offset: 0 }),
      ]);
      return (
        <PartnerShell initialToken={token} initialPartner={me.partner}>
          <OffersClient
            initialLoaded
            initialGroups={g.items}
            initialRedirects={r.items}
            initialDomains={c.domains}
            initialDefaultDomain={c.defaultDomain}
            initialItems={s.items}
            initialTotal={s.total}
          />
        </PartnerShell>
      );
    } catch {
      // fall through to login / client-side restore
    }
  }

  return (
    <PartnerShell>
      <OffersClient />
    </PartnerShell>
  );
}
