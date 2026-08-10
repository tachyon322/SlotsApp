import { PartnerShell } from '@/components/partner/PartnerShell';
import StatsClient from '@/components/partner/StatsClient';
import { partnerApi } from '@/lib/api';
import dayjs from 'dayjs';
import { getPartnerToken } from '../server';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const token = await getPartnerToken();

  if (token) {
    try {
      const from = dayjs().subtract(29, 'day').format('YYYY-MM-DD');
      const to = dayjs().format('YYYY-MM-DD');
      const [me, stats, g, r, c] = await Promise.all([
        partnerApi.me(token),
        partnerApi.stats(token, from, to),
        partnerApi.groups(token),
        partnerApi.redirects(token),
        partnerApi.config(token),
      ]);
      return (
        <PartnerShell initialToken={token} initialPartner={me.partner}>
          <StatsClient
            initialLoaded
            initialStats={stats}
            initialGroups={g.items}
            initialRedirects={r.items}
            initialDomains={c.domains}
            initialDefaultDomain={c.defaultDomain}
          />
        </PartnerShell>
      );
    } catch {
      // fall through to login / client-side restore
    }
  }

  return (
    <PartnerShell>
      <StatsClient />
    </PartnerShell>
  );
}
