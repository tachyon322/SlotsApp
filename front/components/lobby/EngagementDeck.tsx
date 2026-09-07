'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';

interface WinEntry {
  id: number;
  name: string;
  game: string;
  gameHref: string;
  amount: number;
  multiplier: number;
  at: number;
}

const NAMES = [
  'Ice_49', 'Геннадий Ф.', 'xThunderx', 'player75816', 'Мария Ч.', 'Даниил Э.',
  'Лариса Ц.', 'chillflex28', 'Виктория О.', 'Никита А.', 'Слава П.', 'Kuzmich',
];

const GAME_LINKS: Array<{ name: string; href: string }> = [
  { name: 'Слоты', href: '/game/slots' },
  { name: 'Кейсы', href: '/game/cases' },
  { name: 'Mines', href: '/game/mines' },
  { name: 'MineDrop', href: '/game/minedrop' },
  { name: 'Crash', href: '/game/crash' },
  { name: 'BlockBlast', href: '/game/blockblast' },
];

const RANKING = [
  { name: 'Мария Ч.', amount: 394479.9 },
  { name: 'Виктория О.', amount: 346311.08 },
  { name: 'chillflex28', amount: 242091.19 },
  { name: 'Лариса Ц.', amount: 190160.33 },
  { name: 'Даниил Э.', amount: 145338.33 },
];

let entrySeq = 0;

function createEntry(ageMs: number): WinEntry {
  const game = GAME_LINKS[Math.floor(Math.random() * GAME_LINKS.length)];
  return {
    id: ++entrySeq,
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    game: game.name,
    gameHref: game.href,
    amount: (Math.floor(Math.random() * 180) + 5) * 50,
    multiplier: Math.round((Math.random() * 8000 + 300)),
    at: Date.now() - ageMs,
  };
}

function formatRelative(at: number, now: number): string {
  const seconds = Math.max(1, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds} сек назад`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  return `${Math.round(minutes / 60)} ч назад`;
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

export function EngagementDeck() {
  const [tab, setTab] = useState<'wins' | 'ranking'>('wins');
  const [expanded, setExpanded] = useState(false);
  // Демо-данные генерируем только на клиенте после монтирования,
  // чтобы не ломать гидратацию (random + Date.now)
  const [wins, setWins] = useState<WinEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setWins(
      Array.from({ length: 6 }, (_, i) =>
        createEntry(i * 20000 + Math.floor(Math.random() * 8000)),
      ),
    );

    // Новая победа каждые ~8 секунд
    const winsId = window.setInterval(() => {
      setWins((current) => [createEntry(Math.floor(Math.random() * 4000)), ...current].slice(0, 7));
    }, 8000);

    // Перерисовка относительного времени
    const nowId = window.setInterval(() => setNow(Date.now()), 5000);

    return () => {
      window.clearInterval(winsId);
      window.clearInterval(nowId);
    };
  }, []);

  const ranking = useMemo(() => RANKING, []);

  return (
    <section
      className="ref-deck"
      data-expanded={expanded}
      aria-labelledby="ref-deck-title"
    >
      <header className="ref-deckHeader">
        <div>
          <span className="ref-eyebrow">Арена</span>
          <h2 id="ref-deck-title" className="ref-deckTitle">
            <span className="ref-mobileGlyph" aria-hidden="true">⚡</span> Лента побед
          </h2>
        </div>
        <div className="ref-deckTabs" role="tablist" aria-label="Разделы арены">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'wins'}
            onClick={() => setTab('wins')}
          >
            Победы
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ranking'}
            onClick={() => setTab('ranking')}
          >
            Рейтинг
          </button>
        </div>
        <button type="button" className="ref-mobileExpand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Свернуть' : 'Смотреть все'}
        </button>
      </header>

      <div className="ref-deckGrid">
        <section
          className="ref-panel"
          data-panel="wins"
          data-selected={tab === 'wins'}
          aria-label="Последние победы"
        >
          <header className="ref-panelHeading">
            <span className="ref-eyebrow">Лента побед</span>
            <h3>Последние победы</h3>
          </header>
          <ol className="ref-activityList" aria-label="Последние победы">
            {wins.map((entry) => (
              <li key={entry.id}>
                <Link
                  className="ref-activityItem"
                  href={entry.gameHref}
                  aria-label={`${entry.name}, ${entry.game}, множитель x${(entry.multiplier / 100).toFixed(2)}, выигрыш ${entry.amount} ₽`}
                >
                  <span className="ref-playerAvatar" aria-hidden="true">
                    {entry.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="ref-activityCopy">
                    <strong>{entry.name}</strong>
                    <small>{entry.game}</small>
                  </span>
                  <span className="ref-winAmount">{entry.amount} ₽</span>
                  <span className="ref-activityResult">
                    <strong>x{(entry.multiplier / 100).toFixed(2)}</strong>
                    <small>{formatRelative(entry.at, now)}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="ref-panel"
          data-panel="ranking"
          data-selected={tab === 'ranking'}
          aria-label="Рейтинг игроков"
        >
          <header className="ref-panelHeading">
            <span className="ref-eyebrow">Рейтинг</span>
            <h3>Рейтинг игроков</h3>
          </header>
          <div className="ref-rankingLayout">
            <ol className="ref-rankingList" aria-label="Рейтинг игроков">
              {ranking.map((row, i) => (
                <li key={row.name}>
                  <span className="ref-rankPosition" aria-label={`Место ${i + 1}`}>
                    {i < 3 ? <Trophy aria-hidden="true" /> : i + 1}
                  </span>
                  <strong className="ref-rankingIdentity">
                    <span className="ref-playerAvatar" aria-hidden="true">
                      {row.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="ref-rankingName">{row.name}</span>
                  </strong>
                  <span>{formatAmount(row.amount)}</span>
                </li>
              ))}
            </ol>
            <span className="ref-rankingArt" aria-hidden="true">
              <Image
                width={128}
                height={128}
                alt=""
                src="/newVisual/arena-trophy-object-128w.webp"
              />
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}
