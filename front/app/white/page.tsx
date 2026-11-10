import type { Metadata } from 'next';
import { WhiteScreen } from '@/components/WhiteScreen';

export const metadata: Metadata = {
  title: 'Загрузка…',
  robots: { index: false, follow: false },
};

// Состояние блокировки надо читать на каждый заход, а не отдавать из кэша.
export const dynamic = 'force-dynamic';

export default function WhitePage() {
  return <WhiteScreen />;
}
