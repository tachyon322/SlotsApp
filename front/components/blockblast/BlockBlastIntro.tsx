'use client';

import { useState } from 'react';
import { Clock3, Layers, TriangleAlert, Trophy } from 'lucide-react';

const PREVIEW: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0],
  [0, 0, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 0],
  [0, 1, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const PREVIEW_PIECES: number[][][] = [
  [[1]],
  [[1, 1]],
  [[1, 1, 1]],
];

const RULES = [
  { icon: Layers, text: (<><strong>15 фигур</strong> до выхода в ×1.5</>) },
  { icon: Clock3, text: <>Таймер на <strong>каждый ход</strong></> },
  { icon: Trophy, text: <>Дальше — <strong>выше множитель</strong></> },
  { icon: TriangleAlert, text: <>Нет места — <strong>конец раунда</strong></> },
];

const HOW_TO = [
  'Перетаскивайте фигуры из лотка на поле 8 × 8 — вращать их нельзя.',
  'Полностью заполненные строки и колонки сгорают и дают бонус +10% ставки.',
  'На каждый ход даётся таймер — с каждым размещением времени всё меньше.',
  'Разместите 15 фигур, чтобы открыть кассаут с множителем от ×1.5.',
  'Не осталось места или время вышло — раунд завершится возвратом части ставки.',
];

export function BlockBlastIntro() {
  const [howOpen, setHowOpen] = useState(false);

  return (
    <section className="bb-stage bu-stage" aria-label="BlockBlast">
      <div className="bb-intro">
        <div className="bb-previewWrap" aria-hidden="true">
          <div className="bb-previewGrid">
            {PREVIEW.map((row, r) => (
              <div className="bb-previewRow" key={r}>
                {row.map((v, c) => (
                  <span
                    key={c}
                    className={v ? 'bb-previewCellOn' : 'bb-previewCellOff'}
                  />
                ))}
              </div>
            ))}
          </div>
          <span className="bb-previewBadge">Готов к раунду</span>
          <div className="bb-previewPieces">
            {PREVIEW_PIECES.map((cells, i) => (
              <span
                key={i}
                className="bb-previewPiece"
                data-columns={cells[0].length}
                data-rows={cells.length}
                style={{
                  gridTemplateRows: `repeat(${cells.length}, 1fr)`,
                  gridTemplateColumns: `repeat(${cells[0].length}, 1fr)`,
                }}
                aria-hidden="true"
              >
                {cells.flat().map((v, j) =>
                  v ? <span key={j} className="bb-previewPieceOn" /> : null,
                )}
              </span>
            ))}
          </div>
        </div>

        <ul className="bb-rulesCard">
          {RULES.map((rule, i) => (
            <li key={i} className="bb-rulesItem">
              <rule.icon className="bb-rulesIcon" aria-hidden="true" />
              <span>{rule.text}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="bb-howToToggle"
          aria-expanded={howOpen}
          onClick={() => setHowOpen((v) => !v)}
        >
          Как играть {howOpen ? '▲' : '▼'}
        </button>
        {howOpen && (
          <ol className="bb-howToList">
            {HOW_TO.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
