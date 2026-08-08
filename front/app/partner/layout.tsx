import type { ReactNode } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntApp, ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        locale={ruRU}
        theme={{
          token: {
            colorPrimary: '#0070F3',
            borderRadius: 12,
            colorBgLayout: '#FAFAFA',
            fontSize: 13,
          },
        }}
      >
        <AntApp style={{ minHeight: '100vh' }}>{children}</AntApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
