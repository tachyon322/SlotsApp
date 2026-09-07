'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useDrift, formatRu, formatCompact } from './useOnline';

interface LibraryGame {
  id: string;
  title: string;
  tag: string;
  href: string;
  cover: string;
  online: { initial: number; min: number; max: number };
  categories: string[];
  badge?: string;
}

const GAMES: LibraryGame[] = [
  { id: 'crash', title: 'Crash', tag: 'x100', href: '/game/crash', cover: '/newVisual/crash-cover-320w.webp', online: { initial: 1200, min: 500, max: 1350 }, categories: ['fast'] },
  { id: 'slots', title: 'Слоты', tag: '777', href: '/game/slots', cover: '/newVisual/slots-cover-320w.webp', online: { initial: 2000, min: 800, max: 2200 }, categories: ['slots'] },
  { id: 'mines', title: 'Mines', tag: 'sapper', href: '/game/mines', cover: '/newVisual/mines-cover-320w.webp', online: { initial: 500, min: 300, max: 700 }, categories: ['fast', 'strategy'] },
  { id: 'cases', title: 'Кейсы', tag: 'loot', href: '/game/cases', cover: '/newVisual/cases-cover-320w.webp', online: { initial: 1100, min: 450, max: 1400 }, categories: ['cases'], badge: 'Новое' },
  { id: 'minedrop', title: 'MineDrop', tag: 'drop', href: '/game/minedrop', cover: '/newVisual/minedrop-cover-320w.webp', online: { initial: 450, min: 250, max: 600 }, categories: ['fast', 'arcade'] },
  { id: 'blockblast', title: 'BlockBlast', tag: 'blast', href: '/game/blockblast', cover: '/newVisual/blockblast-cover-320w.webp', online: { initial: 1100, min: 400, max: 1300 }, categories: ['arcade', 'strategy'], badge: 'Новое' },
];

const CATEGORIES: Array<{ id: string; label: string; desktopOnly?: boolean }> = [
  { id: 'all', label: 'Все' },
  { id: 'fast', label: 'Быстрые' },
  { id: 'strategy', label: 'Стратегия' },
  { id: 'arcade', label: 'Аркада' },
  { id: 'slots', label: 'Слоты', desktopOnly: true },
  { id: 'cases', label: 'Кейсы', desktopOnly: true },
];

function GameCardOnline({ online }: { online: { initial: number; min: number; max: number } }) {
  const value = useDrift(online.initial, online.min, online.max, 3600);

  return (
    <span className="ref-gameOnline" aria-label={`${formatRu(value)} онлайн`}>
      <span className="ref-onlineDot" aria-hidden="true" />
      <span className="ref-onlineExact">{formatRu(value)} онлайн</span>
      <span className="ref-onlineMobile">{formatCompact(value)}</span>
    </span>
  );
}

export function GameLibrary() {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return GAMES.filter((game) => {
      const byCategory = category === 'all' || game.categories.includes(category);
      const byQuery = normalizedQuery === '' || game.title.toLowerCase().includes(normalizedQuery);
      return byCategory && byQuery;
    });
  }, [category, query]);

  const resetFilters = () => {
    setCategory('all');
    setQuery('');
  };

  return (
    <section className="ref-library" aria-labelledby="ref-games-title" id="games">
      <header className="ref-libraryHeader">
        <div>
          <span className="ref-eyebrow">Каталог игр</span>
          <h2 id="ref-games-title" className="ref-libraryTitle">Каталог игр</h2>
        </div>
        <button type="button" className="ref-libraryAll" onClick={resetFilters}>
          Смотреть все
        </button>
        <label className="ref-gameSearch">
          <Search aria-hidden="true" />
          <input
            aria-label="Поиск игр"
            placeholder="Найти игру"
            maxLength={80}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      <div className="ref-categories" role="group" aria-label="Категории игр">
        {CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.desktopOnly ? 'ref-desktopCategory' : undefined}
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="ref-gameGrid">
        {visible.map((game) => (
          <Link
            key={game.id}
            className="ref-gameCard"
            data-testid="reference-game-card"
            data-game-id={game.id}
            href={game.href}
            aria-label={`Открыть ${game.title}`}
          >
            <span className="ref-gameArt" aria-hidden="true">
              <Image
                width={320}
                height={400}
                alt=""
                src={game.cover}
                sizes="(max-width: 767px) calc((100vw - 44px) / 3), (max-width: 1199px) min(calc(27vw - 2px), 234px), (max-width: 1599px) 192px, 248px"
              />
            </span>
            {game.badge ? (
              <span className="ref-gameBadges">
                <span>{game.badge}</span>
              </span>
            ) : null}
            <span className="ref-gameBody">
              <strong>{game.title}</strong>
              <small>{game.tag}</small>
              <GameCardOnline online={game.online} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
