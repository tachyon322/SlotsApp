'use client';

import React from 'react';
import { Trophy, Zap } from 'lucide-react';
import type { SlotMode } from '@/hooks/useSlotsGame';

interface SlotsTabsProps {
  mode: SlotMode;
  disabled?: boolean;
  onModeChange: (mode: SlotMode) => void;
}

export function SlotsTabs({ mode, disabled, onModeChange }: SlotsTabsProps) {
  return (
    <div className="sl-tabs slv2-tabs" role="tablist" aria-label="Режим слотов">
      <button
        type="button"
        role="tab"
        className="sl-tab"
        data-active={mode === 'classic'}
        aria-selected={mode === 'classic'}
        disabled={disabled}
        onClick={() => onModeChange('classic')}
      >
        {mode === 'classic' && <span className="sl-tabDot" aria-hidden="true" />}
        <Trophy className="sl-tabIcon" aria-hidden="true" />
        Классический
      </button>

      <button
        type="button"
        role="tab"
        className="sl-tab"
        data-active={mode === 'mega'}
        aria-selected={mode === 'mega'}
        disabled={disabled}
        onClick={() => onModeChange('mega')}
      >
        {mode === 'mega' && <span className="sl-tabDot" aria-hidden="true" />}
        <Zap className="sl-tabIcon" aria-hidden="true" />
        Мега-Слоты
      </button>
    </div>
  );
}
