import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LITGAME GAMES',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Документ, в который middleware переписывает любой заход заблокированного
 * пользователя. URL при этом остаётся тем, что открыл пользователь, а весь UI
 * даёт root-layout (SiteLockOverlay). Маркер нужен, чтобы оверлей показался
 * ещё до гидратации.
 */
export default function PreloadPage() {
  return <div id="site-lock-route" hidden />;
}
