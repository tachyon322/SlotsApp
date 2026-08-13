'use client';

import { useEffect, useState } from 'react';
import {
  partnerApi,
  type AffiliateSource,
  type AffiliateGroup,
  type AffiliateRedirect,
} from '@/lib/api';
import {
  AppModal,
  Field,
  Segmented,
  Switch,
  btnOutline,
  btnPrimary,
  inputClass,
  selectClass,
  textareaClass,
} from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import { showSuccess } from '@/lib/toast';

interface SourceModalProps {
  open: boolean;
  token: string;
  initial: AffiliateSource | null;
  groups: AffiliateGroup[];
  redirects: AffiliateRedirect[];
  domains: string[];
  defaultDomain?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SourceModal({
  open,
  token,
  initial,
  groups,
  redirects,
  domains,
  defaultDomain = '',
  onClose,
  onSaved,
}: SourceModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'link' | 'promo'>('link');
  const [code, setCode] = useState('');
  const [registrationBonus, setRegistrationBonus] = useState('');
  const [groupId, setGroupId] = useState('');
  const [redirectId, setRedirectId] = useState('');
  const [domain, setDomain] = useState('');
  const [comment, setComment] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setType(initial.type);
      setCode(initial.code);
      setRegistrationBonus(initial.registrationBonus === null || initial.registrationBonus === undefined ? '' : String(initial.registrationBonus));
      setGroupId(initial.groupId ?? '');
      setRedirectId(initial.redirectId ?? '');
      setDomain(initial.domain ?? '');
      setComment(initial.comment ?? '');
      setIsActive(initial.isActive);
    } else {
      setName('');
      setType('link');
      setCode('');
      setRegistrationBonus('');
      setGroupId('');
      setRedirectId('');
      setDomain('');
      setComment('');
      setIsActive(true);
    }
    setError(null);
  }, [open, initial]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      type,
      code: code.trim() || undefined,
      registrationBonus: registrationBonus.trim() === '' ? null : Number(registrationBonus),
      groupId: groupId || null,
      redirectId: redirectId || null,
      domain: type === 'promo' ? null : domain || null,
      comment: comment.trim() || null,
      isActive,
    };
    try {
      if (initial) {
        await partnerApi.updateSource(token, initial.id, payload);
        showSuccess('Источник обновлён');
      } else {
        await partnerApi.createSource(token, payload);
        showSuccess('Источник создан');
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
      title={initial ? 'Редактировать источник' : 'Новый источник'}
      maxWidthClass="max-w-[32rem]"
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
        <Field label="Тип">
          <Segmented
            value={type}
            options={[
              { label: 'Ссылка', value: 'link' },
              { label: 'Промокод', value: 'promo' },
            ]}
            onChange={setType}
            className="w-full [&>button]:flex-1"
          />
        </Field>

        <Field label="Название">
          <input
            className={inputClass}
            placeholder="Например: Telegram-канал #1"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label={type === 'promo' ? 'Промокод' : 'Код ссылки'}
          hint="Оставьте пустым, чтобы сгенерировать автоматически"
        >
          <input
            className={cn(inputClass, 'uppercase')}
            placeholder="AFF2026"
            maxLength={32}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>

        <Field
          label={type === 'promo' ? 'Сумма промокода' : 'Бонус при регистрации'}
          hint={
            type === 'promo'
              ? 'Сумма, которую получит пользователь за активацию промокода. Пусто — стандартное начисление'
              : 'Оставьте пустым, чтобы использовать стандартный бонус'
          }
        >
          <div className="flex items-center gap-3 rounded-button border border-white/15 bg-white/5 px-4 py-2.5 focus-within:border-blue-500">
            <input
              type="number"
              min={0}
              step={100}
              className="w-full bg-transparent text-sm font-semibold text-white placeholder:text-white/30 focus:outline-none"
              placeholder="Стандартный"
              value={registrationBonus}
              onChange={(e) => setRegistrationBonus(e.target.value)}
            />
            <span className="text-sm font-bold text-white/70">₽</span>
          </div>
        </Field>

        {type === 'link' && (
          <Field label="Домен ссылки" hint="Пусто — домен, на котором открыта панель">
            <select className={selectClass} value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="">Домен панели</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="flex gap-3">
          <Field label="Поток" className="flex-1">
            <select className={selectClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Без потока</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          {type === 'link' && (
            <Field label="Редирект" className="flex-1">
              <select className={selectClass} value={redirectId} onChange={(e) => setRedirectId(e.target.value)}>
                <option value="">Без редиректа</option>
                {redirects.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <Field label="Комментарий">
          <textarea
            className={textareaClass}
            rows={2}
            placeholder="Заметка для себя"
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

        <p className="text-xs text-muted-foreground">
          Ссылка источника: {`${defaultDomain || (typeof window !== 'undefined' ? window.location.origin : '')}/r/{code}`}
        </p>
      </div>
    </AppModal>
  );
}
