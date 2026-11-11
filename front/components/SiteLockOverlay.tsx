import Image from 'next/image';

/**
 * Прелоадер заблокированного сайта. Разметка рендерится в root-layout всегда,
 * видимость — только через CSS по `data-site-locked`/роуту `/preload`, чтобы
 * при протухшей сессии сайт не успевал мелькнуть до гидратации.
 */
export function SiteLockOverlay() {
  return (
    <div id="site-lock-overlay" role="status" aria-live="polite" aria-label="Загрузка">
      <div className="site-lock-stack">
        <Image
          src="/lg/img/logo-starx-mark.webp"
          alt=""
          width={64}
          height={64}
          priority
          className="site-lock-mark"
        />
        <span className="site-lock-bar" aria-hidden="true" />
      </div>
    </div>
  );
}
