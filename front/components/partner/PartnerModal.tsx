'use client';

import { useEffect, useState } from 'react';
import { partnerApi, type AffiliatePartner } from '@/lib/api';
import { AppModal, Field, Switch, btnOutline, btnPrimary, inputClass } from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import { showSuccess } from '@/lib/toast';

interface PartnerModalProps {
  open: boolean;
  token: string;
  initial: AffiliatePartner | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PartnerModal({ open, token, initial, onClose, onSaved }: PartnerModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setEmail(initial?.email ?? '');
    setPassword('');
    setIsActive(initial?.isActive ?? true);
    setIsAdmin(initial?.isAdmin ?? false);
    setComment(initial?.comment ?? '');
    setError(null);
  }, [open, initial]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Укажите имя');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Некорректный email');
      return;
    }
    if (!initial && password.length < 6) {
      setError('Пароль не короче 6 символов');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await partnerApi.updatePartner(token, initial.id, {
          name: name.trim(),
          email: email.trim(),
          password: password || undefined,
          isActive,
          isAdmin,
          comment: comment.trim() || undefined,
        });
        showSuccess('Партнёр обновлён');
      } else {
        const res = await partnerApi.createPartner(token, {
          name: name.trim(),
          email: email.trim(),
          password,
          isActive,
          isAdmin,
          comment: comment.trim() || undefined,
        });
        showSuccess(`Партнёр создан. Email: ${res.email}, пароль: ${res.password}`);
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
      title={initial ? 'Редактировать веб-партнёра' : 'Новый веб-партнёр'}
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
        {!initial && (
          <p className="text-xs text-muted-foreground">
            Партнёр будет заходить в панель по своему email и паролю и видеть только свои офферы и статистику. С правами
            админа он дополнительно увидит балансы всех партнёров и игроков.
          </p>
        )}
        <Field label="Имя">
          <input className={inputClass} placeholder="Веб №1" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input
            className={inputClass}
            placeholder="web1@example.com"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={initial ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль'}>
          <input
            type="password"
            className={inputClass}
            placeholder="Минимум 6 символов"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Комментарий">
          <input
            className={inputClass}
            placeholder="Например: рекламное агентство"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/80">Активен</span>
          <Switch checked={isActive} onChange={setIsActive} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className="block text-xs font-semibold text-white/80">Админ</span>
            <span className="block text-xs text-muted-foreground">Видит балансы всех партнёров и игроков</span>
          </div>
          <Switch checked={isAdmin} onChange={setIsAdmin} />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </AppModal>
  );
}
