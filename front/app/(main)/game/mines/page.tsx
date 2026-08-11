'use client';

import { useMinesGame } from '@/hooks/useMinesGame';
import { MinesBoard } from '@/components/mines/MinesBoard';
import { MinesControls } from '@/components/mines/MinesControls';
import { MinesHistory } from '@/components/mines/MinesHistory';

export default function MinesPage() {
  const game = useMinesGame();

  return (
    <main className="px-page md:px-2xl pt-2 md:pt-4 pb-8 w-full">
      <div className="mx-auto max-w-5xl">
        <div className="mines_layout">
          <div className="mines_main">
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
          <MinesHistory history={game.state.history} />
        </div>
      </div>
    </main>
  );
}
