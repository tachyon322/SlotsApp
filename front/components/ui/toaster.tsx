'use client';

import type { CSSProperties } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

// Тосты в графитовой схеме макета. Цвета заданы hex-ами, а не --lg-*:
// Toaster стоит в корневом layout и нужен также на страницах без lg-hub.css.
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      theme="dark"
      richColors
      toastOptions={{
        style: {
          borderRadius: '14px',
          borderWidth: '1px',
          fontWeight: 600,
        },
      }}
      style={
        {
          '--normal-bg': '#1A1A1A',
          '--normal-border': 'rgba(255, 255, 255, 0.1)',
          '--normal-text': '#ffffff',
          '--error-bg': '#2A1616',
          '--error-border': 'rgba(252, 90, 90, 0.45)',
          '--error-text': '#FFB8B8',
          '--success-bg': '#142212',
          '--success-border': 'rgba(109, 234, 93, 0.45)',
          '--success-text': '#B8F5B0',
        } as CSSProperties
      }
      offset={16}
      gap={8}
    />
  );
}
