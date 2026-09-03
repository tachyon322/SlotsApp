import { redirect } from 'next/navigation';

// Партнёрский кабинет переехал в CashX — переиспользуемую партнёрскую
// платформу. Все старые ссылки /partner/* ведут туда.
const CASHX_WEB = process.env.NEXT_PUBLIC_CASHX_WEB_ORIGIN || 'https://cashxpay.cc';

export default function PartnerPage() {
  redirect(CASHX_WEB);
}
