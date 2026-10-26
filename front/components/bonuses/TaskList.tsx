'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { Check, Clock, Gift, MonitorSmartphone } from 'lucide-react';
import type { AchievementView } from '@/lib/api';
import { formatRub, formatShort } from '@/lib/format';
import { achievementArt } from './art';
import { useDayCountdown } from './useDayCountdown';

export type TaskKey = 'welcome' | 'install' | `challenge:${string}`;

type TaskState = 'ready' | 'progress' | 'claimed';

interface TaskListProps {
  welcome: { amount: number; claimed: boolean };
  install: { amount: number; claimed: boolean };
  /** Задания дня; null — гость или не загрузились */
  challenges: AchievementView[] | null;
  guest: boolean;
  claiming: TaskKey | null;
  onClaim: (key: TaskKey) => void;
  onLogin: () => void;
}

interface RowProps {
  icon: ReactNode;
  title: string;
  text: string;
  amount: number;
  state: TaskState;
  progress?: { value: number; target: number };
  busy: boolean;
  guest: boolean;
  onClaim: () => void;
}

function TaskRow({ icon, title, text, amount, state, progress, busy, guest, onClaim }: RowProps) {
  const pct = progress && progress.target > 0 ? Math.min(100, Math.round((progress.value / progress.target) * 100)) : 0;
  return (
    <li className="lb-row" data-state={state}>
      <span className="lb-row-ic" aria-hidden="true">
        {icon}
      </span>
      <span className="lb-row-body">
        <b>{title}</b>
        <span>{text}</span>
        {state === 'progress' && progress && (
          <span className="lb-row-prog">
            <span className="pg-bar" aria-hidden="true">
              <i style={{ width: `${pct}%` }} />
            </span>
            <small>
              {formatShort(progress.value)} / {formatShort(progress.target)}
            </small>
          </span>
        )}
      </span>
      <span className="lb-row-end">
        {amount > 0 && <strong>{formatRub(amount)}</strong>}
        {state === 'claimed' ? (
          <span className="lb-done">
            <Check aria-hidden="true" />
            Получено
          </span>
        ) : state === 'ready' ? (
          <button type="button" className="pg-btn pg-btn-acc pg-btn-sm" onClick={onClaim} disabled={busy}>
            {busy && <span className="pg-spin" aria-hidden="true" />}
            {guest ? 'Войти' : 'Забрать'}
          </button>
        ) : null}
      </span>
    </li>
  );
}

// Задания: дневные (обновляются вместе с бонусным днём) и разовые
export function TaskList({ welcome, install, challenges, guest, claiming, onClaim, onLogin }: TaskListProps) {
  const countdown = useDayCountdown();

  const once = [
    {
      key: 'welcome' as const,
      icon: <Gift />,
      title: 'Приветственный бонус',
      text: 'Разовая награда новым игрокам',
      amount: welcome.amount,
      claimed: welcome.claimed,
    },
    {
      key: 'install' as const,
      icon: <MonitorSmartphone />,
      title: 'Установите приложение',
      text: 'Иконка STARX на экране устройства',
      amount: install.amount,
      claimed: install.claimed,
    },
  ];

  const stateOfChallenge = (c: AchievementView): TaskState =>
    c.status === 'claimed' ? 'claimed' : c.status === 'completed' ? 'ready' : 'progress';

  const ready =
    once.filter((t) => !guest && !t.claimed).length +
    (challenges ?? []).filter((c) => c.status === 'completed').length;

  const claim = (key: TaskKey) => (guest ? onLogin() : onClaim(key));

  return (
    <section className="pg-card lb-tasks" aria-labelledby="lb-tasks-title">
      <header className="pg-sec-head">
        <div>
          <span className="pg-eyebrow">Задания</span>
          <h2 id="lb-tasks-title">Выполняйте и забирайте</h2>
        </div>
        {ready > 0 && <span className="pg-pill pg-pill-live">{ready} готово</span>}
      </header>

      {challenges && challenges.length > 0 && (
        <>
          <div className="lb-sub">
            <span>Задания дня</span>
            <span className="lb-sub-r">
              <Clock aria-hidden="true" />
              обновятся через <span className="lb-timer">{countdown}</span>
            </span>
          </div>
          <ul className="lb-list">
            {challenges.map((c) => {
              const key: TaskKey = `challenge:${c.id}`;
              return (
                <TaskRow
                  key={c.id}
                  icon={<Image src={achievementArt(c)} width={68} height={68} alt="" />}
                  title={c.title}
                  text={c.description}
                  amount={c.reward}
                  state={stateOfChallenge(c)}
                  progress={{ value: c.progress, target: c.target }}
                  busy={claiming === key}
                  guest={guest}
                  onClaim={() => claim(key)}
                />
              );
            })}
          </ul>
        </>
      )}

      <div className="lb-sub">
        <span>Разовые</span>
      </div>
      <ul className="lb-list">
        {once.map((t) => (
          <TaskRow
            key={t.key}
            icon={t.icon}
            title={t.title}
            text={t.text}
            amount={t.amount}
            state={!guest && t.claimed ? 'claimed' : 'ready'}
            busy={claiming === t.key}
            guest={guest}
            onClaim={() => claim(t.key)}
          />
        ))}
      </ul>
    </section>
  );
}
