'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { PaymentRequisites } from '@/lib/api';

/**
 * Реквизиты H2H-платежа прямо в модалке: QR-код, кнопка банка или номер для
 * перевода. Покупатель платит, не уходя на страницу провайдера.
 */
export function PaymentRequisitesPanel({ requisites }: { requisites: PaymentRequisites }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(requisites.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // буфер недоступен — номер можно выделить и скопировать вручную
    }
  };

  const details: [string, string][] = [];
  if (requisites.bank) details.push(['Банк', requisites.bank]);
  if (requisites.owner) details.push(['Получатель', requisites.owner]);
  if (requisites.comment) details.push(['Комментарий', requisites.comment]);

  return (
    <div className="flex w-full flex-col items-center gap-sm rounded-panel border border-zinc-800 bg-zinc-900 p-md">
      {requisites.payAmount && (
        <p className="text-center text-sm text-zinc-300">
          Переведите ровно{' '}
          <span className="font-bold text-white">{requisites.payAmount} ₽</span>
        </p>
      )}

      {requisites.kind === 'image' && (
        // data URL проверен на сервере: только png/jpeg/webp в base64
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={requisites.value}
          alt="QR-код для оплаты"
          className="h-56 w-56 rounded-card bg-white object-contain p-2"
        />
      )}

      {requisites.kind === 'link' && (
        <a
          href={requisites.value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-14 w-full items-center justify-center gap-xs whitespace-nowrap rounded-control bg-gradient-to-r from-emerald-500 to-emerald-600 text-base font-bold text-white transition-colors hover:from-emerald-600 hover:to-emerald-700 focus-visible:outline-none"
        >
          <ExternalLink className="h-5 w-5" />
          Оплатить в приложении банка
        </a>
      )}

      {requisites.kind === 'text' && (
        <div className="flex w-full items-center justify-between gap-sm rounded-control border border-zinc-800 bg-zinc-950 px-md py-sm">
          <span className="break-all font-mono text-base text-white">{requisites.value}</span>
          <button
            type="button"
            onClick={copy}
            aria-label="Скопировать реквизиты"
            className="inline-flex shrink-0 items-center gap-xs text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
        </div>
      )}

      {requisites.kind === 'image' && (
        <p className="text-center text-xs text-zinc-500">
          Отсканируйте QR-код в приложении банка. На телефоне — сделайте скриншот и выберите
          его в разделе «Оплата по QR».
        </p>
      )}

      {details.length > 0 && (
        <dl className="w-full space-y-1 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-sm">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="text-right text-zinc-200">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
