'use client';

import { useCasesGame } from '@/hooks/useCasesGame';
import { CasesPicker } from '@/components/cases/CasesPicker';
import { CasesStage } from '@/components/cases/CasesStage';
import { CasesControls } from '@/components/cases/CasesControls';
import { CasesHistory } from '@/components/cases/CasesHistory';
import { CasesContentsModal } from '@/components/cases/CasesContentsModal';
import { CasesReceiptModal } from '@/components/cases/CasesReceiptModal';

export default function CasesPage() {
  const game = useCasesGame();
  const s = game.state;

  // Крупный занос (множитель раунда ≥ 10) — подсветка сцены.
  const bigWin = s.settled && s.lastMultiplier >= 10;

  return (
    <div className="kc-page">
      <h1 className="sr-only">Кейсы</h1>

      <CasesPicker activeCaseId={s.activeCaseId} spinning={s.spinning} onSelect={game.actions.setActiveCaseId} />

      <div className="kc-play">
        <div className="kc-main">
          <CasesStage
            lines={s.activeLines}
            spinning={s.spinning}
            spinId={s.spinId}
            settled={s.settled}
            settledLines={s.settledLines}
            linesData={s.linesData}
            lineBet={s.activeCase.price}
            bigWin={bigWin}
            lastPayout={s.lastPayout}
            lastMultiplier={s.lastMultiplier}
            outcome={s.outcome}
            maxRarity={s.maxRarity}
          />
          <CasesControls
            linePrice={s.activeCase.price}
            activeLines={s.activeLines}
            totalBet={s.totalBet}
            spinning={s.spinning}
            onSelectLines={game.actions.setActiveLines}
            onSpin={() => void game.actions.spin()}
            onOpenContents={() => game.actions.setIsContentsModalOpen(true)}
          />
        </div>

        <CasesHistory
          history={s.history}
          stats={s.stats}
          onOpenReceipt={(item) => game.actions.setSelectedReceiptItem(item)}
        />
      </div>

      <CasesContentsModal
        open={s.isContentsModalOpen}
        onClose={() => game.actions.setIsContentsModalOpen(false)}
        activeCaseId={s.activeCaseId}
      />
      <CasesReceiptModal
        open={Boolean(s.selectedReceiptItem)}
        onClose={() => game.actions.setSelectedReceiptItem(null)}
        item={s.selectedReceiptItem}
      />
    </div>
  );
}
