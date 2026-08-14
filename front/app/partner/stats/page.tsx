import { PartnerShell } from '@/components/partner/PartnerShell';
import StatsClient from '@/components/partner/StatsClient';
import { partnerApi } from '@/lib/api';
import { addDays, toInputDate } from '@/components/partner/format';
import { getPartnerToken } from '../server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function StatsPage() {
  const token = await getPartnerToken();

  if (token) {
    try {
      const from = toInputDate(addDays(new Date(), -29));
      const to = toInputDate(new Date());
      const [me, stats, g, r, c, s] = await Promise.all([
        partnerApi.me(token),
        partnerApi.stats(token, from, to),
        partnerApi.groups(token),
        partnerApi.redirects(token),
        partnerApi.config(token),
        partnerApi.sources(token, { limit: PAGE_SIZE, offset: 0 }),
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
      <StatsClient />
    </PartnerShell>
  );
}
