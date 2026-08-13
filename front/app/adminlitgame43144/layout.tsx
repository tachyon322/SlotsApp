import type { ReactNode } from 'react';
import { PageTransition } from '@/components/PageTransition';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
