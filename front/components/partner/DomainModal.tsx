'use client';

import { useEffect, useState } from 'react';
import { partnerApi, type AffiliateDomain } from '@/lib/api';
import { AppModal, Field, Switch, btnOutline, btnPrimary, inputClass, textareaClass } from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import { showSuccess } from '@/lib/toast';

interface DomainModalProps {
  open: boolean;
  token: string;
  initial: AffiliateDomain | null;
  onClose: () => void;
  onSaved: () => void;
}

export function DomainModal({ open, token, initial, onClose, onSaved }: DomainModalProps) {
  const [url, setUrl] = useState('');
  const [comment, setComment] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(initial?.url ?? '');
    setComment(initial?.comment ?? '');
    setIsActive(initial?.isActive ?? true);
    setError(null);
  }, [open, initial]);

  const handleSubmit = async () => {
    if (!url.trim()) {
      setError('Укажите домен');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await partnerApi.updateDomain(token, initial.id, { url: url.trim(), isActive, comment: comment.trim() || undefined });
        showSuccess('Домен обновлён');
      } else {
        await partnerApi.createDomain(token, { url: url.trim(), isActive, comment: comment.trim() || undefined });
        showSuccess('Домен добавлен');
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
      title={initial ? 'Редактировать домен' : 'Новый домен'}
      maxWidthClass="max-w-[26rem]"
      footer={
        <>
          <button type="button" className={btnOutline} onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="button" className={cn(btnPrimary, 'flex-1')} onClick={() => void handleSubmit()} disabled={saving}>
            {initial ? 'Сохранить' : 'Добавить'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Домен" hint="Например: https://casino2.com — на нём будут жить ссылки /r/CODE">
          <input
            className={inputClass}
            placeholder="https://casino2.com"
            maxLength={120}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label="Комментарий">
          <textarea
            className={textareaClass}
            rows={2}
            placeholder="Заметка"
            maxLength={300}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/80">Активен</span>
          <Switch checked={isActive} onChange={setIsActive} />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </AppModal>
  );
}
