import Link from "next/link";
import Image from "next/image";
import { SUPPORT_EMAIL, TERMS_HREF } from "@/lib/legal";

export function Footer() {
  return (
    <footer className="web-hub-footer_footer__Hw15I" aria-label="Информация LITGAME">
      <span className="web-hub-footer_aura__aox6c" aria-hidden="true" />
      <div className="web-hub-footer_identity__0iOrr">
        <span className="web-hub-footer_brandLockup__QfFMO" aria-label="LITGAME">
          <Image
            className="web-hub-footer_brandMark__SYEsD"
            width={40}
            height={40}
            alt=""
            src="/newVisual/brand-mark.svg"
          />
          <Image
            className="web-hub-footer_brandWordmark__TBEg2"
            width={150}
            height={28}
            alt="LITGAME"
            src="/newVisual/wordmark.svg"
          />
        </span>
      </div>
      <nav className="web-hub-footer_navigation__zD0XV" aria-label="Ссылки LITGAME">
        <section className="web-hub-footer_group__co6k9" aria-labelledby="web-hub-footer-litgame">
          <h2 id="web-hub-footer-litgame">LITGAME</h2>
          <Link href="/about">
            <span>О нас</span>
          </Link>
          <Link href="/rules">
            <span>Правила</span>
          </Link>
          <Link href={TERMS_HREF}>
            <span>Пользовательское соглашение</span>
          </Link>
          <Link href="/privacy">
            <span>Политика конфиденциальности</span>
          </Link>
        </section>
        <section className="web-hub-footer_group__co6k9" aria-labelledby="web-hub-footer-play">
          <h2 id="web-hub-footer-play">Безопасность</h2>
          <Link href="/responsible">
            <span>Ответственная игра</span>
          </Link>
        </section>
        <section className="web-hub-footer_group__co6k9" aria-labelledby="web-hub-footer-help">
          <h2 id="web-hub-footer-help">Помощь</h2>
          <Link href="/support" className="web-hub-footer_external__OJN3_">
            <span>Поддержка</span>
          </Link>
          <Link href="/faq">
            <span>FAQ</span>
          </Link>
          <a
            href="https://www.otzoviks.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="web-hub-footer_external__OJN3_"
          >
            <span>Отзывы</span>
          </a>
        </section>
      </nav>
      <div className="web-hub-footer_legal__uQGO1">
        <span>© 2026 LITGAME</span>
        {SUPPORT_EMAIL ? (
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="transition-colors hover:text-white"
          >
            {SUPPORT_EMAIL}
          </a>
        ) : null}
        <span>Играйте ответственно</span>
      </div>
    </footer>
  );
}
