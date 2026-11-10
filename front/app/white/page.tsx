import { redirect } from 'next/navigation';

/** Старые закладки на /white: URL больше не используется, уводим на главную. */
export default function WhiteStubPage() {
  redirect('/');
}
