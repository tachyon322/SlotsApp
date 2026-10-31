import Link from "next/link";
import Image from "next/image";
import { Gamepad2, Trophy, Users, Zap } from "lucide-react";
import { SERVICE_HOST, SUPPORT_EMAIL, TERMS_HREF } from "@/lib/legal";
import { FooterStat } from "./FooterStat";

export function Footer() {
  return (
    <footer className="lg-foot" aria-label="Информация STARX">
      <div className="lg-foot-top">
        <Link className="lg-logo" href="/" aria-label="STARX — лобби">
          <Image className="lg-logo-img" width={367} height={128} alt="STARX" src="/lg/img/logo-starx.webp" />
        </Link>
        <span className="lg-age">
          <b>18+</b>Играйте ответственно
        </span>
      </div>

      <div className="lg-foot-grid">
        <div className="lg-legal">
          <b>© 2026 STARX</b>
          STARX GAMES · {SERVICE_HOST}
          {SUPPORT_EMAIL ? (
            <>
              <br />
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </>
          ) : null}
        </div>
        <nav className="lg-fcol" aria-label="STARX">
          <h5>STARX</h5>
          <Link href="/about">О нас</Link>
          <Link href="/rules">Правила</Link>
          <Link href={TERMS_HREF}>Пользовательское соглашение</Link>
          <Link href="/privacy">Политика конфиденциальности</Link>
        </nav>
        <nav className="lg-fcol" aria-label="Безопасность">
          <h5>Безопасность</h5>
          <Link href="/responsible">Ответственная игра</Link>
        </nav>
        <nav className="lg-fcol" aria-label="Помощь">
          <h5>Помощь</h5>
          <Link href="/support">Поддержка</Link>
          <Link href="/faq">FAQ</Link>
          <a href="https://www.otzoviks.com/" target="_blank" rel="noopener noreferrer">
            Отзывы
          </a>
        </nav>
      </div>
    </footer>
  );
}
