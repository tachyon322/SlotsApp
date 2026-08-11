'use client';

import React from 'react';
import { useCasesGame } from '@/hooks/useCasesGame';
import { CasesStage } from '@/components/cases/CasesStage';
import { CasesControls } from '@/components/cases/CasesControls';
import { CasesHistory } from '@/components/cases/CasesHistory';
import { CasesContentsModal } from '@/components/cases/CasesContentsModal';
import { CasesReceiptModal } from '@/components/cases/CasesReceiptModal';

export default function CasesPage() {
  const game = useCasesGame();

  return (
    <main className="px-page md:px-2xl pt-md md:pt-xl pb-2xl w-full">
      <div className="mx-auto max-w-5xl">
        <div className="cases_content__gr4as">
          {/* Stage / Roulette Reels */}
          <CasesStage
            lines={game.state.activeLines}
            spinning={game.state.spinning}
            spinId={game.state.spinId}
            settled={game.state.settled}
            settledLines={game.state.settledLines}
            linesData={game.state.linesData}
            lineBet={game.state.activeCase.price}
            lastPayout={game.state.lastPayout}
            lastMultiplier={game.state.lastMultiplier}
            outcome={game.state.outcome}
            maxRarity={game.state.maxRarity}
          />

          {/* Controls & Case Selector */}
          <CasesControls
            activeCaseId={game.state.activeCaseId}
            activeLines={game.state.activeLines}
            totalBet={game.state.totalBet}
            maxPayout={game.state.maxPayout}
            spinning={game.state.spinning}
            onSelectCase={game.actions.setActiveCaseId}
            onSelectLines={game.actions.setActiveLines}
            onSpin={game.actions.spin}
            onOpenContents={() => game.actions.setIsContentsModalOpen(true)}
          />

          {/* Game History */}
          <CasesHistory
            history={game.state.history}
            stats={game.state.stats}
            onOpenReceipt={(item) => game.actions.setSelectedReceiptItem(item)}
          />
        </div>
      </div>

      {/* Contents Modal */}
      <CasesContentsModal
        open={game.state.isContentsModalOpen}
        onClose={() => game.actions.setIsContentsModalOpen(false)}
        activeCaseId={game.state.activeCaseId}
      />

      {/* Receipt Modal */}
      <CasesReceiptModal
        open={Boolean(game.state.selectedReceiptItem)}
        onClose={() => game.actions.setSelectedReceiptItem(null)}
        item={game.state.selectedReceiptItem}
      />
    </main>
  );
}
