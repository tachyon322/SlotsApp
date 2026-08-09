import 'server-only';
import { cookies } from 'next/headers';
import { PARTNER_TOKEN_COOKIE } from '@/lib/partner-auth';

export async function getPartnerToken(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(PARTNER_TOKEN_COOKIE)?.value;
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
