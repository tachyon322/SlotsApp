export type CaseRarity = 'common' | 'uncommon' | 'epic' | 'legendary' | 'mythic';

export interface CaseMeta {
  id: string;
  name: string;
  price: number;
  icon: string;
  ariaLabel: string;
}

export const CASES_LIST: CaseMeta[] = [
  { id: 'common',    name: 'Обычный кейс',      price: 100,   icon: '🥉', ariaLabel: 'Обычный кейс — 100 ₽' },
  { id: 'rare',      name: 'Редкий кейс',       price: 500,   icon: '🥈', ariaLabel: 'Редкий кейс — 500 ₽' },
  { id: 'legendary', name: 'Легендарный кейс', price: 2000,  icon: '🥇', ariaLabel: 'Легендарный кейс — 2 000 ₽' },
  { id: 'mega',      name: 'Мега кейс',          price: 5000,  icon: '💎', ariaLabel: 'Мега кейс — 5 000 ₽' },
  { id: 'elite',     name: 'Элитный кейс',       price: 10000, icon: '💠', ariaLabel: 'Элитный кейс — 10 000 ₽' },
];

export interface RarityStyle {
  id: CaseRarity;
  label: string;
  color: string;
  borderColor: string;
  bgGradient: string;
  winnerGradient: string;
  glowColor: string;
}

export const RARITY_STYLES: Record<CaseRarity, RarityStyle> = {
  common: {
    id: 'common',
    label: 'Обычный',
    color: 'rgb(154, 166, 187)',
    borderColor: 'rgb(154, 166, 187)',
    bgGradient: 'linear-gradient(160deg, rgb(38, 42, 49) 0%, rgb(24, 27, 33) 100%)',
    winnerGradient: 'linear-gradient(160deg, rgb(135, 148, 168) 0%, rgb(81, 91, 110) 100%)',
    glowColor: 'rgba(154, 166, 187, 0.4)',
  },
  uncommon: {
    id: 'uncommon',
    label: 'Необычный',
    color: 'rgb(76, 195, 245)',
    borderColor: 'rgb(76, 195, 245)',
    bgGradient: 'linear-gradient(160deg, rgb(15, 39, 51) 0%, rgb(11, 28, 38) 100%)',
    winnerGradient: 'linear-gradient(160deg, rgb(76, 195, 245) 0%, rgb(29, 159, 212) 100%)',
    glowColor: 'rgba(76, 195, 245, 0.5)',
  },
  epic: {
    id: 'epic',
    label: 'Эпический',
    color: 'rgb(184, 132, 255)',
    borderColor: 'rgb(184, 132, 255)',
    bgGradient: 'linear-gradient(160deg, rgb(34, 20, 54) 0%, rgb(25, 15, 42) 100%)',
    winnerGradient: 'linear-gradient(160deg, rgb(184, 132, 255) 0%, rgb(124, 58, 237) 100%)',
    glowColor: 'rgba(184, 132, 255, 0.5)',
  },
  legendary: {
    id: 'legendary',
    label: 'Легендарный',
    color: 'rgb(255, 191, 77)',
    borderColor: 'rgb(255, 191, 77)',
    bgGradient: 'linear-gradient(160deg, rgb(46, 29, 16) 0%, rgb(36, 22, 12) 100%)',
    winnerGradient: 'linear-gradient(160deg, rgb(255, 191, 77) 0%, rgb(217, 119, 6) 100%)',
    glowColor: 'rgba(255, 191, 77, 0.6)',
  },
  mythic: {
    id: 'mythic',
    label: 'Мифический',
    color: 'rgb(255, 121, 225)',
    borderColor: 'rgb(255, 121, 225)',
    bgGradient: 'linear-gradient(160deg, rgb(42, 20, 48) 0%, rgb(22, 26, 46) 100%)',
    winnerGradient: 'linear-gradient(135deg, rgb(255, 79, 216) 0%, rgb(139, 92, 246) 48%, rgb(52, 211, 224) 100%)',
    glowColor: 'rgba(255, 121, 225, 0.7)',
  },
};

// Web Audio API sound generator for case spin
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
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Audio fallback
    }
  }

  playTick() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      // Audio fallback
    }
  }

  playLand() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio fallback
    }
  }

  playWin() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);

        gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.07);
        osc.stop(ctx.currentTime + idx * 0.07 + 0.3);
      });
    } catch {
      // Audio fallback
    }
  }
}

export const soundEngine = new SoundEngine();
