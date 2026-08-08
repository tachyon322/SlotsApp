'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { ModalShell } from '@/components/ModalShell';
import { adminApi, type AdminUserItem } from '@/lib/api';

interface EditUserModalProps {
  open: boolean;
  token: string;
  user: AdminUserItem | null;
  onClose: () => void;
  onSaved: () => void;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  accent,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'number';
  accent?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-white/80">{label}</label>
      <div className="flex items-center gap-3 rounded-button border border-white/15 bg-white/5 px-4 py-2.5 focus-within:border-blue-500">
        {accent && <span className="text-sm font-bold text-white/70">{accent}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm font-semibold text-white placeholder:text-white/30 focus:outline-none"
        />
      </div>
    </div>
  );
}

export function EditUserModal({ open, token, user, onClose, onSaved }: EditUserModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [balance, setBalance] = useState('');
  const [level, setLevel] = useState('');
  const [xp, setXp] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setName(user.name);
      setEmail(user.email);
      setBalance(String(user.balance));
      setLevel(String(user.level));
      setXp(String(user.xp ?? 0));
      setError(null);
    }
  }, [open, user]);

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateUser(token, user.id, {
        name: name.trim(),
        email: email.trim(),
        balance: Math.floor(Number(balance)),
        level: Math.floor(Number(level)),
        xp: Math.floor(Number(xp)),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} titleId="edit-user-modal-title" maxWidthClass="max-w-[28rem]">
      <h2 id="edit-user-modal-title" className="text-xl font-bold text-white">
        Редактировать пользователя
      </h2>

      <div className="mt-4 space-y-3">
        <Field label="Имя" value={name} onChange={setName} />
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Баланс" value={balance} onChange={setBalance} type="number" accent="₽" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Уровень" value={level} onChange={setLevel} type="number" />
          <Field label="XP" value={xp} onChange={setXp} type="number" />
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-button border-2 border-white/10 px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-button bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:from-blue-600 hover:to-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" />
          Сохранить
        </button>
      </div>
    </ModalShell>
  );
}
