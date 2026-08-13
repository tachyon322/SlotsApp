'use client';

// Лидерборд временно отключён. Логика страницы не удалена — см. блок-комментарий ниже.
import { PartnerShell } from '@/components/partner/PartnerShell';

export default function LeaderboardPage() {
  return (
    <PartnerShell>
      <div className="flex min-h-[320px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Раздел временно недоступен</p>
      </div>
    </PartnerShell>
  );
}
