'use client';

import { Layers, Clock3, Trophy, TriangleAlert } from 'lucide-react';

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
  { icon: Layers, text: <>10 фигур до выхода в ×1</> },
  { icon: Clock3, text: <>Таймер на каждый ход</> },
  { icon: Trophy, text: <>Дальше — выше множитель</> },
  { icon: TriangleAlert, text: <>Нет места — конец раунда</> },
];

export function BlockBlastIntro() {
  return (
    <section className="blockblast_stage" aria-label="BlockBlast">
      <div className="blockblast_intro">
        <div className="blockblast_previewWrap" aria-hidden="true">
          <div className="blockblast_previewGrid">
            {PREVIEW.map((row, r) => (
              <div className="blockblast_previewRow" key={r}>
                {row.map((v, c) => (
                  <span
                    key={c}
                    className={v ? 'blockblast_previewCellOn' : 'blockblast_previewCellOff'}
                  />
                ))}
              </div>
            ))}
          </div>
          <span className="blockblast_previewBadge">Готов к раунду</span>
          <div className="blockblast_previewPieces">
            {PREVIEW_PIECES.map((cells, i) => (
              <span
                key={i}
                className="blockblast_previewPiece"
                style={{
                  gridTemplateRows: `repeat(${cells.length}, 1fr)`,
                  gridTemplateColumns: `repeat(${cells[0].length}, 1fr)`,
                }}
              >
                {cells.flat().map((v, j) =>
                  v ? <span key={j} className="blockblast_previewPieceOn" /> : null,
                )}
              </span>
            ))}
          </div>
        </div>

        <ul className="blockblast_rulesCard">
          {RULES.map((rule, i) => (
            <li key={i} className="blockblast_rulesItem">
              <rule.icon className="blockblast_rulesIcon" aria-hidden="true" />
              <span>{rule.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
