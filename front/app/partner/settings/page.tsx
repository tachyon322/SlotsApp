import { PartnerShell } from '@/components/partner/PartnerShell';
import SettingsClient from '@/components/partner/SettingsClient';
import { partnerApi } from '@/lib/api';
import { getPartnerToken } from '../server';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const token = await getPartnerToken();

  if (token) {
    try {
      const me = await partnerApi.me(token);
      const canViewPartners = me.partner.isOwner || me.partner.isAdmin;
      const [g, r, d, p] = await Promise.all([
        partnerApi.groups(token),
        partnerApi.redirects(token),
        partnerApi.domains(token),
        canViewPartners ? partnerApi.partners(token) : Promise.resolve({ items: [] }),
      ]);
      return (
        <PartnerShell initialToken={token} initialPartner={me.partner}>
          <SettingsClient
            initialLoaded
            initialGroups={g.items}
            initialRedirects={r.items}
            initialDomains={d.items}
            initialPartners={p.items}
          />
        </PartnerShell>
      );
    } catch {
      // fall through to login / client-side restore
    }
  }

  return (
    <PartnerShell>
      <SettingsClient />
    </PartnerShell>
  );
}
