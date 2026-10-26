'use client';

import Image from 'next/image';
import { useWheelModal } from '@/components/WheelModal';

interface Ranked {
  name: string;
  amount: number;
}

// Демо-рейтинг недели (как и раньше: настоящих данных у лобби нет)
const RANKING: Ranked[] = [
  { name: 'Мария Ч.', amount: 394479 },
  { name: 'Виктория О.', amount: 346311 },
  { name: 'chillflex28', amount: 242091 },
  { name: 'Лариса Ц.', amount: 190160 },
  { name: 'Даниил Э.', amount: 145338 },
];

// Порядок пьедестала: 2-е место слева, 1-е в центре, 3-е справа
const PODIUM_ORDER = [1, 0, 2];

const money = (value: number) =>
  `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₽`;

// Топ игроков недели + карточка «Колесо наград»
export function TopPlayers() {
  const { openWheel } = useWheelModal();

  return (
    <section className="lg-sec" aria-labelledby="lg-rank-title">
      <h2 className="lg-sec-title" id="lg-rank-title">Топ игроков недели</h2>
      <div className="lg-rank">
        <ol className="lg-podium" aria-label="Лидеры недели">
          {PODIUM_ORDER.map((i) => {
            const player = RANKING[i];
            return (
              <li key={player.name} className="lg-pod lg-hv" data-p={i + 1}>
                <span className="lg-place" aria-hidden="true">{i + 1}</span>
                <Image
                  width={96}
                  height={96}
                  alt=""
                  src={i === 0 ? '/lg/img/cup.png' : '/lg/img/trophy-128.webp'}
                />
                <span className="lg-ava" aria-hidden="true">{player.name[0].toUpperCase()}</span>
                <b>{player.name}</b>
                <span className="lg-amt lg-num">
                  {money(player.amount)}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="lg-side">
          <ol className="lg-rank-rows" start={4} aria-label="Места с четвёртого">
            {RANKING.slice(3).map((player, k) => (
              <li key={player.name} className="lg-row">
                <span className="lg-n">{k + 4}</span>
                <span className="lg-ava" aria-hidden="true">{player.name[0].toUpperCase()}</span>
                <b>{player.name}</b>
                <span className="lg-amt lg-num">
                  {money(player.amount)}
                </span>
              </li>
            ))}
          </ol>
          <button className="lg-wheel-card" type="button" onClick={openWheel}>
            <h4>Колесо наград</h4>
            <p>Крути колесо и забирай бонусы на баланс</p>
            <span className="lg-btn lg-btn-blue">Открыть колесо</span>
            <Image width={180} height={180} alt="" src="/lg/img/wheel-256.webp" />
          </button>
        </div>
      </div>
    </section>
  );
}
