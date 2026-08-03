export type SlotSymbolId = '7' | 'diamond' | 'bag' | 'star' | 'bell' | 'lemon' | 'cherry' | 'wild';

export interface SymbolMeta {
  id: SlotSymbolId;
  emoji: string;
  label: string;
  color: string;
  payouts: Record<number, number>; // 3, 4, 5 -> multiplier
}

export const SLOT_SYMBOLS: Record<SlotSymbolId, SymbolMeta> = {
  '7': {
    id: '7',
    emoji: '7️⃣',
    label: 'Семёрка',
    color: '#ef4444',
    payouts: { 3: 50, 4: 200, 5: 1000 },
  },
  'diamond': {
    id: 'diamond',
    emoji: '💎',
    label: 'Алмаз',
    color: '#3b82f6',
    payouts: { 3: 25, 4: 100, 5: 500 },
  },
  'bag': {
    id: 'bag',
    emoji: '💰',
    label: 'Мешок денег',
    color: '#eab308',
    payouts: { 3: 15, 4: 60, 5: 300 },
  },
  'star': {
    id: 'star',
    emoji: '⭐',
    label: 'Звезда',
    color: '#f59e0b',
    payouts: { 3: 10, 4: 40, 5: 200 },
  },
  'bell': {
    id: 'bell',
    emoji: '🔔',
    label: 'Колокольчик',
    color: '#6366f1',
    payouts: { 3: 5, 4: 20, 5: 100 },
  },
  'lemon': {
    id: 'lemon',
    emoji: '🍋',
    label: 'Лимон',
    color: '#facc15',
    payouts: { 3: 3, 4: 10, 5: 50 },
  },
  'cherry': {
    id: 'cherry',
    emoji: '🍒',
    label: 'Вишня',
    color: '#f43f5e',
    payouts: { 3: 2, 4: 5, 5: 25 },
  },
  'wild': {
    id: 'wild',
    emoji: '🃏',
    label: 'Вайлд',
    color: '#a855f7',
    payouts: { 3: 100, 4: 400, 5: 2000 },
  },
};

export const ALL_SYMBOL_KEYS: SlotSymbolId[] = ['7', 'diamond', 'bag', 'star', 'bell', 'lemon', 'cherry', 'wild'];

export function getSymbolEmoji(id: string): string {
  return SLOT_SYMBOLS[id as SlotSymbolId]?.emoji || id || '❓';
}

// Web Audio API helper for retro casino sound effects
class SoundEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playSpin() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio play error fallback
    }
  }

  playLand() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Audio fallback
    }
  }

  playWin() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.25);
      });
    } catch {
      // Audio fallback
    }
  }
}

export const soundEngine = new SoundEngine();
