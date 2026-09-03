import { redirect } from 'next/navigation';

// Партнёрский кабинет переехал в CashX — все старые вложенные ссылки
// (/partner/stats, /partner/payout, …) ведут туда.
const CASHX_WEB = process.env.NEXT_PUBLIC_CASHX_WEB_ORIGIN || 'https://cashxpay.cc';

export default function PartnerSubPage() {
  redirect(CASHX_WEB);
}
