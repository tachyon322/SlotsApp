'use client';

import type { CSSProperties } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      theme="dark"
      richColors
      toastOptions={{
        style: {
          borderRadius: '20px',
          borderWidth: '1px',
        },
      }}
      style={
        {
          '--error-bg': '#7f1d1d',
          '--error-border': '#dc2626',
          '--error-text': '#fecaca',
          '--success-bg': '#065f46',
          '--success-border': '#10b981',
          '--success-text': '#a7f3d0',
        } as CSSProperties
      }
      offset={16}
      gap={8}
    />
  );
}
