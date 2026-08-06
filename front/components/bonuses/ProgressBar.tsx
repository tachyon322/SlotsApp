'use client';

interface ProgressBarProps {
  percent: number;
  tone?: 'blue' | 'green' | 'violet' | 'slate' | 'orange' | 'gold';
}

export function ProgressBar({ percent, tone = 'blue' }: ProgressBarProps) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-pill bg-white/10"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className="bonus-progress-fill block h-full rounded-pill"
        data-tone={tone}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}
