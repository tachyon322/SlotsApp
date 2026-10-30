'use client';

import { Info } from 'lucide-react';
import type { SlotMode } from '@/hooks/useSlotsGame';

interface SlotsTabsProps {
  mode: SlotMode;
  disabled?: boolean;
  onModeChange: (mode: SlotMode) => void;
  onOpenRules: () => void;
}

export function SlotsTabs({ mode, disabled, onModeChange, onOpenRules }: SlotsTabsProps) {
  return (
    <div className="sg-top">
      <div className="sg-seg" role="tablist" aria-label="Режим слотов">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'classic'}
          disabled={disabled}
          onClick={() => onModeChange('classic')}
        >
          Классика <small>3×3</small>
        </button>
        <button
          type="button"
          role="tab"
          data-mega="true"
          aria-selected={mode === 'mega'}
          disabled={disabled}
          onClick={() => onModeChange('mega')}
        >
          Мега <small>5×3</small>
        </button>
      </div>
      <button type="button" className="sg-iconbtn" aria-label="Правила" onClick={onOpenRules}>
        <Info aria-hidden="true" />
      </button>
    </div>
  );
}
