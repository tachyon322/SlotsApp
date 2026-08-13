'use client';

import { useEffect, useState } from 'react';
import { partnerApi, type AffiliateGroup } from '@/lib/api';
import { AppModal, Field, btnOutline, btnPrimary, inputClass, textareaClass } from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import { showSuccess } from '@/lib/toast';

interface GroupModalProps {
  open: boolean;
  token: string;
  initial: AffiliateGroup | null;
  onClose: () => void;
  onSaved: () => void;
}

export function GroupModal({ open, token, initial, onClose, onSaved }: GroupModalProps) {
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setComment(initial?.comment ?? '');
    setError(null);
  }, [open, initial]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await partnerApi.updateGroup(token, initial.id, { name: name.trim(), comment: comment.trim() || undefined });
        showSuccess('Поток обновлён');
      } else {
        await partnerApi.createGroup(token, { name: name.trim(), comment: comment.trim() || undefined });
        showSuccess('Поток создан');
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
      title={initial ? 'Редактировать поток' : 'Новый поток'}
      maxWidthClass="max-w-[26rem]"
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
          <input
            className={inputClass}
            placeholder="Например: Основной поток"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
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
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </AppModal>
  );
}
