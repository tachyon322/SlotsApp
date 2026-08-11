'use client';

import { useBlockBlastGame } from '@/hooks/useBlockBlastGame';
import { BlockBlastIntro } from '@/components/blockblast/BlockBlastIntro';
import { BlockBlastBoard } from '@/components/blockblast/BlockBlastBoard';
import { BlockBlastControls } from '@/components/blockblast/BlockBlastControls';
import { BlockBlastHistory } from '@/components/blockblast/BlockBlastHistory';
import { BlockBlastModal } from '@/components/blockblast/BlockBlastModal';
import { useUser } from '@/components/UserProvider';

export default function BlockBlastPage() {
  const game = useBlockBlastGame();
  const { user } = useUser();
  const s = game.state;

  return (
    <main className="px-page max-[399px]:px-xs md:px-2xl pt-md md:pt-xl pb-2xl w-full">
      <div className="mx-auto max-w-5xl">
        <div className="blockblast_layout">
          <div className="blockblast_main">
            {s.phase === 'idle' ? (
              <BlockBlastIntro />
            ) : (
              <BlockBlastBoard
                phase={s.phase}
                board={s.board}
                palette={s.palette}
                placements={s.placements}
                multiplier={s.multiplier}
                take={s.take}
                nextMult={s.nextMult}
                timer={s.timer}
                timerLevel={s.timerLevel}
                clearing={s.clearing}
                selectedSlot={s.selectedSlot}
                settlement={s.settlement}
                onPlace={game.actions.place}
                onSelectSlot={game.actions.selectSlot}
              />
            )}
            <BlockBlastControls
              phase={s.phase}
              betAmount={s.betAmount}
              balance={user?.balance ?? null}
              cashoutAvailable={s.cashoutAvailable}
              take={s.take}
              multiplier={s.multiplier}
              onBet={game.actions.setBetAmount}
              onPlay={game.actions.openModal}
              onCashout={game.actions.cashout}
              onAgain={game.actions.playAgain}
            />
          </div>
          <BlockBlastHistory history={s.history} />
        </div>
      </div>

      <BlockBlastModal
        open={s.modalOpen}
        betAmount={s.betAmount}
        onCancel={game.actions.cancelStart}
        onConfirm={() => {
          void game.actions.startGame();
        }}
      />
    </main>
  );
}
