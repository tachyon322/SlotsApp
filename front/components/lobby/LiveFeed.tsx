'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LOBBY_GAMES } from './games';
import { useDrift, formatRu } from './useOnline';

interface Drop {
  id: number;
  name: string;
  game: (typeof LOBBY_GAMES)[number];
  amount: number;
  mult: number;
  fresh: boolean;
}

const NAMES = [
  'Ice_49', 'Геннадий Ф.', 'xThunderx', 'player75816', 'Мария Ч.', 'Даниил Э.',
  'Лариса Ц.', 'chillflex28', 'Виктория О.', 'Никита А.', 'Слава П.', 'Kuzmich',
];

const MAX_DROPS = 16;
const NEW_DROP_MS = 3500;

let dropSeq = 0;

function createDrop(fresh: boolean): Drop {
  const roll = Math.random();
  return {
    id: ++dropSeq,
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    game: LOBBY_GAMES[Math.floor(Math.random() * LOBBY_GAMES.length)],
    amount: (Math.floor(Math.random() * 180) + 5) * 50,
    mult: roll > 0.9 ? 40 + Math.random() * 60 : roll > 0.72 ? 10 + Math.random() * 25 : 1.2 + Math.random() * 7,
    fresh,
  };
}

// Лента последних побед (демо-данные, как и раньше: настоящих событий у лобби нет)
export function LiveFeed() {
  const online = useDrift(4989, 4300, 5800, 3500);
  // Демо-данные создаём только на клиенте после монтирования — иначе random ломает гидратацию
  const [drops, setDrops] = useState<Drop[]>([]);

  useEffect(() => {
    setDrops(Array.from({ length: 12 }, () => createDrop(false)));
    const id = window.setInterval(() => {
      setDrops((current) => [createDrop(true), ...current].slice(0, MAX_DROPS));
    }, NEW_DROP_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="lg-live" aria-label="Последние победы">
      <div className="lg-live-head">
        <b><span className="lg-dot" />LIVE</b>
        <span className="lg-num">{formatRu(online)} онлайн</span>
      </div>
      <div className="lg-live-track">
        {drops.map((drop) => {
          const tier = drop.mult >= 40 ? ' lg-huge' : drop.mult >= 10 ? ' lg-big' : '';
          return (
            <Link
              key={drop.id}
              className={`lg-drop${tier}${drop.fresh ? ' lg-enter' : ''}`}
              href={drop.game.href}
              aria-label={`${drop.name}, ${drop.game.title}, x${drop.mult.toFixed(2)}, ${formatRu(drop.amount)} ₽`}
            >
              <span className="lg-who">{drop.name}</span>
              <span className="lg-sum lg-num">
                <span className="lg-coin" />
                {formatRu(drop.amount)} ₽<em>x{drop.mult.toFixed(2)}</em>
              </span>
              <Image width={86} height={86} alt="" src={`/lg/img/${drop.game.obj}.webp`} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
