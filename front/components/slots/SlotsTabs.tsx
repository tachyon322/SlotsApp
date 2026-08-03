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
    <div className="slots_tabs__X0S4_" role="tablist" aria-label="Режим слотов">
      <button
        type="button"
        role="tab"
        className="slots_tab__hcyUh"
        data-active={mode === 'classic'}
        aria-selected={mode === 'classic'}
        disabled={disabled}
        onClick={() => onModeChange('classic')}
      >
        {mode === 'classic' && <span className="slots_tabDot__geXRl" aria-hidden="true" />}
        <Trophy className="slots_tabIcon__VmjyX" aria-hidden="true" />
        Классический
      </button>

      <button
        type="button"
        role="tab"
        className="slots_tab__hcyUh"
        data-active={mode === 'mega'}
        aria-selected={mode === 'mega'}
        disabled={disabled}
        onClick={() => onModeChange('mega')}
      >
        {mode === 'mega' && <span className="slots_tabDot__geXRl" aria-hidden="true" />}
        <Zap className="slots_tabIcon__VmjyX" aria-hidden="true" />
        Мега-Слоты
      </button>
    </div>
  );
}
