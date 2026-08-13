'use client';

import { useEffect, useState } from 'react';
import { Link, Plus, Trash2 } from 'lucide-react';
import { partnerApi, type AffiliateRedirect } from '@/lib/api';
import {
  AppModal,
  Field,
  Switch,
  btnOutline,
  btnPrimary,
  inputClass,
  textareaClass,
} from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import { showSuccess } from '@/lib/toast';

interface UrlDraft {
  id?: string;
  url: string;
  weight: number;
  isActive: boolean;
}

interface RedirectModalProps {
  open: boolean;
  token: string;
  initial: AffiliateRedirect | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RedirectModal({ open, token, initial, onClose, onSaved }: RedirectModalProps) {
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [urls, setUrls] = useState<UrlDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setComment(initial.comment ?? '');
      setUrls(initial.urls.map((u) => ({ id: u.id, url: u.url, weight: u.weight, isActive: u.isActive })));
    } else {
      setName('');
      setComment('');
      setUrls([]);
    }
    setError(null);
  }, [open, initial]);

  const updateUrl = (index: number, patch: Partial<UrlDraft>) => {
    setUrls((prev) => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await partnerApi.updateRedirect(token, initial.id, { name: name.trim(), comment: comment.trim() || undefined });
        const currentIds = new Set(urls.filter((u) => u.id).map((u) => u.id as string));
        for (const old of initial.urls) {
          if (!currentIds.has(old.id)) await partnerApi.deleteRedirectUrl(token, initial.id, old.id);
        }
        for (const u of urls) {
          if (u.id) {
            await partnerApi.updateRedirectUrl(token, initial.id, u.id, { url: u.url, weight: u.weight, isActive: u.isActive });
          } else if (u.url.trim()) {
            await partnerApi.addRedirectUrl(token, initial.id, { url: u.url.trim(), weight: u.weight });
          }
        }
        showSuccess('Редирект обновлён');
      } else {
        const urlsList = urls.filter((u) => u.url.trim()).map((u) => u.url.trim());
        await partnerApi.createRedirect(token, { name: name.trim(), comment: comment.trim() || undefined, urls: urlsList });
        showSuccess('Редирект создан');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={initial ? 'Редактировать редирект' : 'Новый редирект'}
      maxWidthClass="max-w-[34rem]"
      footer={
        <>
          <button type="button" className={btnOutline} onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="button" className={cn(btnPrimary, 'flex-1')} onClick={() => void handleSubmit()} disabled={saving}>
            {initial ? 'Сохранить' : 'Создать'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Название">
          <input className={inputClass} placeholder="Например: Лендинг 1" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Комментарий">
          <textarea className={textareaClass} rows={2} placeholder="Заметка" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>

        <div className="border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Ссылки (вес = частота показа)</span>
            <button
              type="button"
              className={cn(btnOutline, 'px-3 py-1.5 text-xs')}
              onClick={() => setUrls((prev) => [...prev, { url: '', weight: 1, isActive: true }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить
            </button>
          </div>

          <div className="space-y-2">
            {urls.map((u, i) => (
              <div key={u.id ?? `new-${i}`} className="flex items-center gap-2">
                <Link className="h-4 w-4 shrink-0 text-white/40" />
                <input
                  className={cn(inputClass, 'flex-1')}
                  placeholder="https://litgame.fun"
                  value={u.url}
                  onChange={(e) => updateUrl(i, { url: e.target.value })}
                />
                <input
                  type="number"
                  min={1}
                  className={cn(inputClass, 'w-16 px-3')}
                  value={u.weight}
                  onChange={(e) => updateUrl(i, { weight: Number(e.target.value) || 1 })}
                  aria-label="Вес"
                />
                <Switch size="sm" checked={u.isActive} onChange={(v) => updateUrl(i, { isActive: v })} />
                <button
                  type="button"
                  onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded-button p-1.5 text-white/60 transition-colors hover:bg-white/5 hover:text-red-400"
                  aria-label="Удалить ссылку"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {urls.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Ссылок пока нет. Если ссылки не заданы, переходы ведут на главную площадки.
              </p>
            )}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Можно указать домен с протоколом или без него, например: https://litgame.fun
          </p>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </AppModal>
  );
}
