'use client';

import { useMinesGame } from '@/hooks/useMinesGame';
import { MinesBoard } from '@/components/mines/MinesBoard';
import { MinesControls } from '@/components/mines/MinesControls';
import { MinesHistory } from '@/components/mines/MinesHistory';

export default function MinesPage() {
  const game = useMinesGame();

  return (
    <div className="mn2-page" data-phase={game.state.phase}>
      <h1 className="sr-only">Mines</h1>

      <div className="mn2-play">
        <MinesBoard
          phase={game.state.phase}
          cells={game.state.cells}
          mines={game.state.mines}
          betAmount={game.state.betAmount}
          revealed={game.state.revealed}
          freshCell={game.state.freshCell}
          onReveal={game.actions.revealCell}
        />
        <div className="mn2-side">
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
          <MinesHistory history={game.state.history} />
        </div>
      </div>
    </div>
  );
}
