'use client';

import { Gift, MonitorSmartphone, Check, Loader2 } from 'lucide-react';
import { ModalShell } from '@/components/ModalShell';

interface TasksModalProps {
  open: boolean;
  onClose: () => void;
  welcome: { amount: number; claimed: boolean };
  install: { amount: number; claimed: boolean };
  claiming: string | null;
  onClaim: (type: 'welcome' | 'install') => void;
}

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

export function TasksModal({ open, onClose, welcome, install, claiming, onClaim }: TasksModalProps) {
  const tasks: Array<{
    key: 'welcome' | 'install';
    title: string;
    description: string;
    amount: number;
    claimed: boolean;
  }> = [
    {
      key: 'welcome',
      title: 'Приветственный бонус',
      description: 'Разовое вознаграждение новым игрокам после входа в аккаунт.',
      amount: welcome.amount,
      claimed: welcome.claimed,
    },
    {
      key: 'install',
      title: 'Установите приложение',
      description: 'Добавьте иконку LITGAME на экран устройства.',
      amount: install.amount,
      claimed: install.claimed,
    },
  ];

  return (
    <ModalShell open={open} onClose={onClose} titleId="tasks-title" maxWidthClass="max-w-[36rem]">
      <div className="bt-body">
        <h2 id="tasks-title" className="text-lg font-bold text-white">
          Задания
        </h2>
        <div className="bt-list">
          {tasks.map((task) => (
            <article
              key={task.key}
              className="bt-task"
              data-task-state={task.claimed ? 'claimed' : 'claimable'}
            >
              <span className="bt-icon" aria-hidden="true">
                {task.key === 'welcome' ? <Gift /> : <MonitorSmartphone />}
              </span>
              <div className="bt-copy">
                <h3>{task.title}</h3>
                <p>{task.description}</p>
                <span className="bt-progress">{task.claimed ? 'Выполнено' : 'Готово к выполнению'}</span>
              </div>
              <div className="bt-action">
                <strong>{formatRub(task.amount)}</strong>
                <button
                  type="button"
                  onClick={() => onClaim(task.key)}
                  disabled={task.claimed || claiming === task.key}
                >
                  {claiming === task.key && <Loader2 className="animate-spin" />}
                  {task.claimed ? (
                    <>
                      <Check aria-hidden="true" />
                      Получено
                    </>
                  ) : (
                    'Забрать'
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>
        <p className="bt-footnote">Награды зачисляются на баланс сразу после выполнения задания.</p>
      </div>
    </ModalShell>
  );
}
