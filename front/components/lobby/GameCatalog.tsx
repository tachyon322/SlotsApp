'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { GAME_CATEGORIES, LOBBY_GAMES } from './games';
import type { LobbyGame } from './games';
import { useDrift, formatRu } from './useOnline';

function GameOnline({ online }: { online: LobbyGame['online'] }) {
  const value = useDrift(online[0], online[1], online[2], 3600);
  return <span className="lg-num">{formatRu(value)}</span>;
}

// Каталог игр: фильтр по категориям + поиск по названию
export function GameCatalog() {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LOBBY_GAMES.filter(
      (game) =>
        (category === 'all' || game.cats.includes(category)) &&
        (q === '' || game.title.toLowerCase().includes(q)),
    );
  }, [category, query]);

  const reset = () => {
    setCategory('all');
    setQuery('');
  };

  return (
    <section className="lg-sec" id="games" aria-labelledby="lg-games-title">
      <h2 className="lg-sec-title" id="lg-games-title">Игры LITGAME</h2>
      <div className="lg-games-bar">
        <div className="lg-chips" role="group" aria-label="Категории игр">
          {GAME_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="lg-search">
          <Search className="lg-i" aria-hidden="true" />
          <input
            type="search"
            placeholder="Найти игру"
            maxLength={80}
            aria-label="Поиск игр"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="lg-games">
        {visible.map((game) => (
          <Link key={game.id} className="lg-gcard lg-hv" href={game.href} aria-label={`Открыть ${game.title}`}>
            <h3>{game.title}</h3>
            <span className="lg-gstat">
              <span>
                <span className="lg-dot" />
                <GameOnline online={game.online} />
                &nbsp;онлайн
              </span>
              <span>Ставка от 10 ₽</span>
            </span>
            {game.badge ? <span className="lg-tag lg-tag-new">{game.badge}</span> : null}
            <Image width={170} height={170} alt="" src={`/lg/img/${game.obj}.webp`} loading="lazy" />
            <span className="lg-btn lg-btn-gold lg-play">Играть</span>
          </Link>
        ))}
        {visible.length === 0 ? (
          <div className="lg-empty">
            Ничего не найдено
            <button className="lg-btn lg-btn-ghost" type="button" onClick={reset}>
              Сбросить фильтры
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
