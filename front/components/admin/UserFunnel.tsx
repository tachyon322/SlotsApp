'use client';

import type { AdminPendingWithdrawal, AdminUserFunnel } from '@/lib/api';

export type FunnelBadgeState = 'active' | 'outOfOrder' | 'inactive';

/**
 * Заглушка на случай рассинхрона деплоя: старый бэкенд ещё не отдаёт воронку,
 * а новый фронт уже рисует список. Без неё страница поддержки падала бы.
 */
const EMPTY_FUNNEL: AdminUserFunnel = {
  hasDeposit: false,
  hasPaidVerification: false,
  verifiedForPayment: false,
  premiumActive: false,
  hasWithdrawn: false,
};

export function FunnelBadge({
  state,
  label,
  title,
}: {
  state: FunnelBadgeState;
  label: string;
  title: string;
}) {
  const className =
    state === 'active'
      ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-400'
      : state === 'outOfOrder'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      : 'border-white/10 bg-white/[0.02] text-white/35';
  return (
    <span
      title={title}
      data-state={state}
      className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}

export function getCurrentFunnelStage(
  funnel: AdminUserFunnel,
  pendingWithdrawal: AdminPendingWithdrawal | null,
): {
  step: number;
  complete: boolean;
  label: string;
  description: string;
  className: string;
} {
  if (!funnel.hasDeposit) {
    return {
      step: 1,
      complete: false,
      label: 'Ожидает депозит',
      description: 'Шаг 1: первый депозит не совершён',
      className: 'border-white/15 bg-white/5 text-white/75',
    };
  }
  const isVerified = funnel.verifiedForPayment || funnel.hasPaidVerification;
  if (!isVerified) {
    return {
      step: 2,
      complete: false,
      label: 'Ожидает верификацию',
      description: 'Шаг 2: требуется верификация реквизитов',
      className: 'border-amber-500/25 bg-amber-500/15 text-amber-300',
    };
  }
  if (!funnel.premiumActive) {
    return {
      step: 3,
      complete: false,
      label: 'Ожидает Премиум',
      description: 'Шаг 3: требуется Премиум подписка для вывода',
      className: 'border-blue-500/25 bg-blue-500/15 text-blue-300',
    };
  }
  if (pendingWithdrawal) {
    return {
      step: 4,
      complete: false,
      label: 'Вывод в обработке',
      description: `Заявка на вывод ${pendingWithdrawal.amount.toLocaleString('ru-RU')} ₽ ожидает выплаты`,
      className: 'border-blue-500/25 bg-blue-500/15 text-blue-300',
    };
  }
  if (funnel.hasWithdrawn) {
    return {
      step: 4,
      complete: true,
      label: 'Вывод выполнен',
      description: 'Депозит, верификация и Премиум пройдены, вывод выплачен',
      className: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-300',
    };
  }
  return {
    step: 4,
    complete: false,
    label: 'Вывод доступен',
    description: 'Депозит, верификация и Премиум пройдены. Вывод доступен',
    className: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-300',
  };
}

/** Текущий этап одной плашкой — для списков, где нет места под 4 бейджа. */
export function FunnelStagePill({
  funnel,
  pendingWithdrawal,
}: {
  funnel: AdminUserFunnel | null | undefined;
  pendingWithdrawal: AdminPendingWithdrawal | null | undefined;
}) {
  const stage = getCurrentFunnelStage(funnel ?? EMPTY_FUNNEL, pendingWithdrawal ?? null);
  return (
    <span
      title={stage.description}
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${stage.className}`}
    >
      <span className="text-[10px] opacity-60">
        {stage.complete ? 'ПРОЙДЕНО 4/4' : `ЭТАП ${stage.step}/4`}
      </span>
      {stage.label}
    </span>
  );
}

export function FunnelCell({
  funnel,
  pendingWithdrawal,
}: {
  funnel: AdminUserFunnel | null | undefined;
  pendingWithdrawal: AdminPendingWithdrawal | null | undefined;
}) {
  const safeFunnel = funnel ?? EMPTY_FUNNEL;
  const safePending = pendingWithdrawal ?? null;
  const isVerified = safeFunnel.verifiedForPayment || safeFunnel.hasPaidVerification;

  // Gates 1-3 are independent flags, so a later gate can be satisfied while an
  // earlier one is still open. Show the funnel as sequential progress: a badge
  // is only "active" once every previous gate is passed, otherwise an already
  // satisfied later gate is flagged as out of order. The 4th badge reflects the
  // withdrawal itself (заявка в обработке / выплачено).
  const gates = [
    { active: safeFunnel.hasDeposit, label: '1. Депозит', title: 'Был депозит' },
    {
      active: isVerified,
      label: '2. Верификация',
      title: 'Реквизиты подтверждены (авто)',
    },
    {
      active: safeFunnel.premiumActive,
      label: '3. Премиум',
      title: 'Премиум активен (вывод разрешён)',
    },
    {
      active: Boolean(safePending) || safeFunnel.hasWithdrawn,
      label: safePending
        ? '4. Вывод · в обработке'
        : safeFunnel.hasWithdrawn
        ? '4. Вывод · выведено'
        : '4. Вывод',
      title: safePending
        ? `Заявка на вывод ${safePending.amount.toLocaleString('ru-RU')} ₽ в обработке`
        : safeFunnel.hasWithdrawn
        ? 'Вывод был выполнен'
        : 'Вывода ещё не было',
    },
  ];

  let previousPassed = true;
  const sequential = gates.map((gate) => {
    const state: FunnelBadgeState = !gate.active
      ? 'inactive'
      : previousPassed
      ? 'active'
      : 'outOfOrder';
    if (!gate.active) previousPassed = false;
    return { ...gate, state };
  });

  return (
    <div className="min-w-52">
      <FunnelStagePill funnel={safeFunnel} pendingWithdrawal={safePending} />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {sequential.map((gate) => (
          <FunnelBadge
            key={gate.label}
            state={gate.state}
            label={gate.label}
            title={
              gate.state === 'outOfOrder' ? `${gate.title} · пройден вне очереди` : gate.title
            }
          />
        ))}
      </div>
    </div>
  );
}
