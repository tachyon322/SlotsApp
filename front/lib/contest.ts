export const CONTEST_DEADLINE = new Date('2026-08-28T14:00:00');

export const CONTEST_PARTICIPATED_KEY = 'kazik_contest_participated';

export function isContestParticipated(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CONTEST_PARTICIPATED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setContestParticipated(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONTEST_PARTICIPATED_KEY, 'true');
  } catch {
    // ignore
  }
}

export function formatContestDate(date: Date = CONTEST_DEADLINE): string {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function getCountdownParts(now: Date, deadline: Date = CONTEST_DEADLINE): CountdownParts {
  const diff = Math.max(0, deadline.getTime() - now.getTime());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatCountdown(parts: CountdownParts): string {
  const hh = String(parts.hours).padStart(2, '0');
  const mm = String(parts.minutes).padStart(2, '0');
  const ss = String(parts.seconds).padStart(2, '0');
  return `${parts.days}д ${hh}:${mm}:${ss}`;
}
