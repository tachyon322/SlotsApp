'use client';

import { useMinesGame } from '@/hooks/useMinesGame';
import { MinesBoard } from '@/components/mines/MinesBoard';
import { MinesControls } from '@/components/mines/MinesControls';
import { MinesHistory } from '@/components/mines/MinesHistory';

export default function MinesPage() {
  const game = useMinesGame();

  return (
    <div className="mn-shell" data-variant="mines">
      <div className="mn-gameSurface">
        <header className="mn-gameHeader">
          <div>
            <span className="mn-eyebrow">LITGAME ORIGINAL</span>
            <h1 className="mn-title">Mines</h1>
            <p className="mn-subtitle">
              Вскрывайте клетки, наращивайте множитель и забирайте выигрыш до первой мины
            </p>
          </div>
          <span className="mn-heroArt" aria-hidden="true" />
        </header>

        <div className="mn-gameLayout">
          <div className="mn-mainColumn">
            <MinesBoard
              phase={game.state.phase}
              cells={game.state.cells}
              mines={game.state.mines}
              betAmount={game.state.betAmount}
              revealed={game.state.revealed}
              freshCell={game.state.freshCell}
              onReveal={game.actions.revealCell}
            />
            <MinesControls
              phase={game.state.phase}
              mines={game.state.mines}
              betAmount={game.state.betAmount}
              revealed={game.state.revealed}
              onDifficulty={game.actions.setDifficulty}
              onBet={game.actions.setBetAmount}
              onPrimary={() => {
                if (game.state.phase === 'idle') {
                  void game.actions.startGame();
                } else if (game.state.phase === 'playing') {
                  void game.actions.cashout();
                } else {
                  game.actions.playAgain();
                }
              }}
            />
          </div>
          <aside className="mn-sideColumn" aria-label="История Mines">
            <MinesHistory history={game.state.history} />
          </aside>
        </div>
      </div>
    </div>
  );
}
