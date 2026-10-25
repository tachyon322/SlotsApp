'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ArrowRight, Ticket } from 'lucide-react';
import { usePromoModal } from '@/components/PromoModal';

// Промокод на главной: введённый код уходит в модалку активации уже подставленным
export function PromoCard() {
  const { openPromo } = usePromoModal();
  const [code, setCode] = useState('');

  return (
    <form
      className="lg-promo"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        openPromo(code.trim());
        setCode('');
      }}
    >
      <h3>
        Активируй промокод и&nbsp;получи <em>бонус</em>
      </h3>
      <label className="lg-field">
        <Ticket className="lg-i" aria-hidden="true" />
        <input
          name="code"
          placeholder="Введите код"
          maxLength={32}
          aria-label="Промокод"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="lg-btn lg-btn-green" type="submit" aria-label="Активировать">
          <ArrowRight className="lg-i" aria-hidden="true" />
        </button>
      </label>
      <div className="lg-promo-art" aria-hidden="true">
        <Image className="lg-c" width={480} height={480} alt="" src="/lg/img/token.webp" />
        <Image className="lg-t" width={320} height={320} alt="" src="/lg/img/promo-ticket.webp" />
        <Image className="lg-g" width={128} height={128} alt="" src="/lg/img/gift.webp" />
      </div>
    </form>
  );
}
