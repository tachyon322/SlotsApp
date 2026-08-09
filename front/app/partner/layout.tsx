import type { ReactNode } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { PartnerThemeProvider } from '@/components/partner/PartnerThemeProvider';

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return (
    <AntdRegistry>
      <PartnerThemeProvider>{children}</PartnerThemeProvider>
    </AntdRegistry>
  );
}
