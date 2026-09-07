'use client';

import { Zap, ArrowDownToLine, Gift, Sparkles, ArrowUpFromLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTopUpModal } from '../TopUpModal';
import { usePromoModal } from '../PromoModal';
import { useWheelModal } from '../WheelModal';
import { useWithdrawModal } from '../WithdrawModal';

interface QuickAction {
  label: string;
  hint: string;
  icon: LucideIcon;
  run: () => void;
}

export function ActionDock() {
  const { openTopUp } = useTopUpModal();
  const { openPromo } = usePromoModal();
  const { openWheel } = useWheelModal();
  const { openWithdraw } = useWithdrawModal();

  const actions: QuickAction[] = [
    { label: 'Пополнить', hint: 'Баланс', icon: ArrowDownToLine, run: openTopUp },
    { label: 'Промокод', hint: 'Ввести код', icon: Gift, run: openPromo },
    { label: 'Колесо', hint: 'Открыть', icon: Sparkles, run: openWheel },
    { label: 'Вывести', hint: 'Средства', icon: ArrowUpFromLine, run: openWithdraw },
  ];

  return (
    <section className="ref-dockSection">
      <h2 className="ref-dockHeading">
        <Zap aria-hidden="true" fill="currentColor" strokeWidth={0} /> Быстрые действия
      </h2>
      <nav className="ref-dock" aria-label="Быстрые действия">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              className="ref-action"
              type="button"
              onClick={action.run}
              aria-label={action.label}
            >
              <span className="ref-actionIcon" aria-hidden="true">
                <Icon strokeWidth={2} />
              </span>
              <span className="ref-actionCopy">
                <strong>{action.label}</strong>
                <small>{action.hint}</small>
              </span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
