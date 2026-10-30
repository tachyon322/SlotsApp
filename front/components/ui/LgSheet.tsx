'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, X } from 'lucide-react';

/**
 * Оболочка модалок кошелька (пополнение, вывод): на телефоне — шторка снизу,
 * на десктопе — диалог по центру. Стили — секция «Шторка» в app/lg-hub.css (`ls-*`).
 * Скролл body и Escape обрабатывает сама модалка.
 */
export function LgSheet({
  titleId,
  title,
  progress,
  onBack,
  backDisabled,
  onClose,
  footer,
  children,
  state,
  closeDisabled,
}: {
  titleId: string;
  title: ReactNode;
  progress?: { step: number; total: number } | null;
  onBack?: (() => void) | null;
  backDisabled?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  state?: string;
  /** Блокирует крестик и клик по фону (загрузка, вращение колеса). */
  closeDisabled?: boolean;
}) {
  return (
    <div className="ls-overlay" data-state={state}>
      <button type="button" className="ls-backdrop" aria-hidden="true" tabIndex={-1} onClick={closeDisabled ? undefined : onClose} />
      <section className="ls-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <span className="ls-grab" aria-hidden="true" />
        <header className="ls-head">
          {onBack && (
            <button type="button" className="ls-icon" aria-label="Назад" onClick={onBack} disabled={backDisabled}>
              <ChevronLeft />
            </button>
          )}
          <h2 id={titleId}>{title}</h2>
          {progress && (
            <div className="ls-bars" aria-label={`Шаг ${progress.step} из ${progress.total}`}>
              {Array.from({ length: progress.total }, (_, i) => (
                <i key={i} data-on={i < progress.step} />
              ))}
              <span>
                {progress.step} из {progress.total}
              </span>
            </div>
          )}
          <button type="button" className="ls-icon" aria-label="Закрыть" onClick={onClose} disabled={closeDisabled}>
            <X />
          </button>
        </header>
        <div className="ls-body">{children}</div>
        {footer && <footer className="ls-foot">{footer}</footer>}
      </section>
    </div>
  );
}
