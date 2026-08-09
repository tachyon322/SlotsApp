'use client';

import type { ReactNode } from 'react';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import ruRU from 'antd/locale/ru_RU';

const APP_FONT = '"Inter", "Inter Fallback", ui-sans-serif, system-ui, sans-serif';

export function PartnerThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3b8cff',
          colorInfo: '#3b8cff',
          colorBgLayout: '#090d16',
          colorBgContainer: '#0f172a',
          colorBgElevated: '#0f172a',
          colorBorder: 'rgba(255,255,255,0.12)',
          colorBorderSecondary: 'rgba(255,255,255,0.08)',
          borderRadius: 12,
          fontSize: 13,
          fontFamily: APP_FONT,
        },
        components: {
          Layout: {
            headerBg: '#0f172a',
            bodyBg: '#090d16',
          },
          Table: {
            headerBg: 'rgba(255,255,255,0.03)',
            headerColor: '#94a3b8',
            rowHoverBg: 'rgba(255,255,255,0.04)',
            borderColor: 'rgba(255,255,255,0.08)',
          },
          Card: {
            colorBgContainer: '#0f172a',
          },
          Modal: {
            contentBg: '#0f172a',
            headerBg: '#0f172a',
          },
        },
      }}
    >
      <AntApp style={{ minHeight: '100vh' }}>{children}</AntApp>
    </ConfigProvider>
  );
}
