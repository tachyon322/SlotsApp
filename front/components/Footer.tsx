import Link from "next/link";
import Image from "next/image";
import { Gamepad2, Trophy, Users, Zap } from "lucide-react";
import { SUPPORT_EMAIL, TERMS_HREF } from "@/lib/legal";
import { FooterStat } from "./FooterStat";

export function Footer() {
  return (
    <footer className="lg-foot" aria-label="Информация LITGAME">
      <div className="lg-foot-top">
        <Link className="lg-logo" href="/" aria-label="LITGAME — лобби">
          <Image className="lg-mark" width={32} height={32} alt="" src="/lg/img/brand-mark.svg" />
          <Image className="lg-word" width={110} height={18} alt="LITGAME" src="/lg/img/wordmark.svg" />
        </Link>
        <span className="lg-age">
          <b>18+</b>Играйте ответственно
        </span>
      </div>

      <div className="lg-stats">
        <div className="lg-stat">
          <span className="lg-ic"><Users className="lg-i" aria-hidden="true" /></span>
          <div>
            <FooterStat kind="online" />
            <span>Онлайн</span>
          </div>
        </div>
        <div className="lg-stat">
          <span className="lg-ic"><Trophy className="lg-i" aria-hidden="true" /></span>
          <div>
            <FooterStat kind="bigwin" />
            <span>Крупный выигрыш</span>
          </div>
        </div>
        <div className="lg-stat">
          <span className="lg-ic"><Gamepad2 className="lg-i" aria-hidden="true" /></span>
          <div>
            <b>6</b>
            <span>Игр в лобби</span>
          </div>
        </div>
        <div className="lg-stat">
          <span className="lg-ic"><Zap className="lg-i" aria-hidden="true" /></span>
          <div>
            <b>10 ₽</b>
            <span>Минимальная ставка</span>
          </div>
        </div>
      </div>

      <div className="lg-foot-grid">
        <div className="lg-legal">
          <b>© 2026 LITGAME</b>
          LITGAME GAMES · litxgame.com
          {SUPPORT_EMAIL ? (
            <>
              <br />
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </>
          ) : null}
        </div>
        <nav className="lg-fcol" aria-label="LITGAME">
          <h5>LITGAME</h5>
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
