'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Send } from 'lucide-react';
import { usePartnerAuth } from '@/components/partner/PartnerShell';
import { formatDate, formatRub } from '@/components/partner/format';
import { DataTable, type Column, btnGhost, btnPrimary, inputClass, Field, Segmented, Tag } from '@/components/partner/ui';
import { showError, showSuccess } from '@/lib/toast';
import { partnerApi, type AffiliateTransaction, type AffiliateWithdrawal, type AffiliatePayoutConfig } from '@/lib/api';
import { cn } from '@/lib/utils';

const BANKS = [
  'Сбербанк',
  'Т-Банк',
  'Альфа-Банк',
  'ВТБ',
  'Озон Банк',
  'Яндекс Банк',
  'Газпромбанк',
  'Райффайзенбанк',
  'Росбанк',
  'Банк Открытие',
];

function UsdtIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.8125 6C11.8125 9.21016 9.21016 11.8125 6 11.8125C2.78984 11.8125 0.1875 9.21016 0.1875 6C0.1875 2.78984 2.78984 0.1875 6 0.1875C9.21016 0.1875 11.8125 2.78984 11.8125 6ZM8.49255 5.17195C8.60827 4.39854 8.01933 3.98276 7.21404 3.7054L7.47527 2.6577L6.83747 2.49877L6.58315 3.51886C6.41548 3.47707 6.24326 3.43767 6.07214 3.39862L6.32829 2.37183L5.69084 2.2129L5.42944 3.26023C5.29064 3.22861 5.1544 3.19737 5.02216 3.16451L5.02289 3.16123L4.14328 2.94162L3.97362 3.62276C3.97362 3.62276 4.44684 3.7312 4.43686 3.73791C4.69519 3.80238 4.74187 3.97331 4.73405 4.1088L4.43648 5.30236C4.4543 5.30691 4.47736 5.31345 4.50279 5.32362C4.48153 5.31834 4.45882 5.31253 4.43538 5.30691L4.01829 6.97889C3.98667 7.05736 3.90656 7.17506 3.726 7.13039C3.73235 7.13965 3.26241 7.01468 3.26241 7.01468L2.94577 7.74469L3.77578 7.95157C3.93019 7.99027 4.08152 8.03077 4.23047 8.0689L3.96652 9.12858L4.60359 9.28751L4.86499 8.23908C5.03394 8.28487 5.20338 8.32883 5.37328 8.37096L5.11277 9.41447L5.75058 9.5734L6.01453 8.51571C7.10212 8.72152 7.91998 8.6385 8.2642 7.65492C8.54161 6.86297 8.2504 6.40615 7.67817 6.10826C8.09489 6.01221 8.40881 5.73813 8.49255 5.17195ZM7.03528 7.21521C6.83817 8.00716 5.50463 7.57903 5.07227 7.47169L5.42252 6.0678C5.85485 6.17569 7.24127 6.3893 7.03528 7.21521ZM7.23255 5.16052C7.05272 5.88089 5.94277 5.51489 5.58272 5.42517L5.90025 4.15188C6.26032 4.2416 7.41984 4.40906 7.23255 5.16052Z"
        fill="#1E40AF"
      />
    </svg>
  );
}

type Tx = AffiliateTransaction;

export default function Payout() {
  const { token, partner, refreshPartner } = usePartnerAuth();
  const [txns, setTxns] = useState<Tx[]>([]);
  const [withdrawals, setWithdrawals] = useState<AffiliateWithdrawal[]>([]);
  const [config, setConfig] = useState<AffiliatePayoutConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [method, setMethod] = useState<'usdt' | 'sbp'>('usdt');
  const [amount, setAmount] = useState('');
  const [requisites, setRequisites] = useState('');
  const [bank, setBank] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const balance = partner.balance;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, w, c] = await Promise.all([
        partnerApi.transactions(token),
        partnerApi.withdrawals(token),
        partnerApi.payoutConfig(token),
      ]);
      setTxns(t.items);
      setWithdrawals(w.items);
      setConfig(c);
    } catch (err) {
      showError((err as Error).message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const numAmount = Math.floor(Number(amount));
  const validAmount = Number.isFinite(numAmount) && numAmount > 0;
  const fee = useMemo(() => {
    if (method !== 'sbp' || !config || !validAmount) return 0;
    return Math.floor(config.sbpFeeFlat + (numAmount * config.sbpFeePercent) / 100);
  }, [method, config, validAmount, numAmount]);
  const usdtAmount = useMemo(() => {
    if (method !== 'usdt' || !config || !validAmount) return 0;
    return Math.round((numAmount / config.usdtRate) * 100) / 100;
  }, [method, config, validAmount, numAmount]);
  const netAmount = method === 'sbp' ? numAmount - fee : numAmount;

  const canSubmit =
    validAmount &&
    !!config &&
    numAmount >= config.minWithdraw &&
    requisites.trim().length > 0 &&
    (method === 'usdt' || bank.trim().length > 0) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await partnerApi.requestWithdrawal(token, {
        method,
        amount: numAmount,
        requisites: requisites.trim(),
        bank: method === 'sbp' ? bank.trim() : undefined,
      });
      showSuccess('Заявка на вывод отправлена на модерацию');
      setAmount('');
      setRequisites('');
      setBank('');
      await Promise.all([load(), refreshPartner()]);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const exportCsv = () => {
    const header = ['Дата', 'Тип', 'Сумма, руб', 'Статус'];
    const rows = txns.map((t) => {
      const typeLabel =
        t.type === 'commission' ? 'Начисление комиссии' : t.type === 'withdrawal' ? 'Вывод' : 'Возврат вывода';
      return [t.createdAt, typeLabel, t.amount, ''];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate_payouts_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const txColumns: Column<Tx>[] = [
    {
      key: 'createdAt',
      title: 'Дата',
      width: '150px',
      render: (t) => <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(t.createdAt)}</span>,
    },
    {
      key: 'type',
      title: 'Операция',
      render: (t) => {
        if (t.type === 'commission') {
          return (
            <div>
              <div className="text-sm text-white">Начисление комиссии</div>
              {t.depositAmount !== null && (
                <div className="text-xs text-muted-foreground">
                  депозит {formatRub(t.depositAmount)} · {t.commissionPercent ?? 0}%
                </div>
              )}
            </div>
          );
        }
        if (t.type === 'withdrawal') {
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white">Вывод</span>
              <Tag color="amber">на модерации</Tag>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-white">Возврат вывода</span>
            <Tag color="red">отклонён</Tag>
          </div>
        );
      },
    },
    {
      key: 'amount',
      title: 'Сумма',
      align: 'right',
      width: '140px',
      render: (t) =>
        t.type === 'commission' ? (
          <span className="font-semibold text-money">+{formatRub(t.amount)}</span>
        ) : t.type === 'withdrawal' ? (
          <span className="font-semibold text-red-400">{formatRub(-t.amount)}</span>
        ) : (
          <span className="font-semibold text-money">+{formatRub(t.amount)}</span>
        ),
    },
  ];

  const statusLabel: Record<AffiliateWithdrawal['status'], { text: string; color: 'amber' | 'green' | 'red' }> = {
    pending: { text: 'На модерации', color: 'amber' },
    approved: { text: 'Одобрен', color: 'green' },
    rejected: { text: 'Отклонён', color: 'red' },
  };

  const wColumns: Column<AffiliateWithdrawal>[] = [
    {
      key: 'createdAt',
      title: 'Дата',
      width: '150px',
      render: (w) => <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(w.createdAt)}</span>,
    },
    {
      key: 'method',
      title: 'Метод',
      width: '130px',
      render: (w) => (
        <div>
          <span className="text-sm text-white">{w.method === 'usdt' ? 'USDT TRC20' : 'СБП'}</span>
          {w.method === 'sbp' && w.bank && <div className="text-xs text-muted-foreground">{w.bank}</div>}
        </div>
      ),
    },
    {
      key: 'amount',
      title: 'Сумма',
      align: 'right',
      width: '140px',
      render: (w) => (
        <div className="text-right">
          <div className="font-semibold text-white">{formatRub(w.amount)}</div>
          {w.method === 'usdt' && w.usdtAmount !== null && (
            <div className="text-xs text-blue-400">≈ {w.usdtAmount} USDT</div>
          )}
          {w.method === 'sbp' && (
            <div className="text-xs text-muted-foreground">
              к зачислению {formatRub(w.amount - w.fee)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      title: 'Статус',
      align: 'right',
      width: '140px',
      render: (w) => {
        const s = statusLabel[w.status];
        return (
          <div className="flex items-center justify-end gap-2">
            <Tag color={s.color}>{s.text}</Tag>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Balance & withdrawal form */}
      <div className="w-full shrink-0 space-y-4 lg:w-96">
        <div className="rounded-card border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-xl font-bold text-white">Баланс</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Комиссия с депозитов привлечённых игроков начисляется на баланс автоматически.
          </p>

          <div className="mt-3 rounded-button border border-emerald-500/25 bg-emerald-500/10 p-3">
            <div className="text-sm font-semibold text-emerald-400">Ваша комиссия: {partner.commissionPercent ?? 0}%</div>
            <div className="mt-0.5 text-xs text-muted-foreground">от каждого депозита привлечённого игрока</div>
          </div>

          <div className="mt-6 rounded-button border border-blue-500/30 bg-blue-500/15 p-5">
            <div className="text-sm font-medium text-muted-foreground">Доступно к выводу</div>
            <div className="mt-1 text-3xl font-bold text-blue-400">{formatRub(balance)}</div>
          </div>

          <div className="mt-4 space-y-2 rounded-button border border-white/10 bg-white/[0.02] p-4 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UsdtIcon />
                Курс USDT TRC20
              </span>
              <span className="font-semibold text-white">{config ? `${config.usdtRate} ₽ за 1 USDT` : '…'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Комиссия СБП</span>
              <span className="font-semibold text-white">
                {config ? `${config.sbpFeeFlat} ₽ + ${config.sbpFeePercent}%` : '…'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Минимальный вывод</span>
              <span className="font-semibold text-white">{config ? formatRub(config.minWithdraw) : '…'}</span>
            </div>
          </div>
        </div>

        {/* Withdrawal form */}
        <div className="rounded-card border border-white/10 bg-white/[0.02] p-6">
          <h3 className="text-base font-bold text-white">Вывод средств</h3>

          <div className="mt-3">
            <Segmented
              value={method}
              onChange={setMethod}
              options={[
                { label: 'USDT TRC20', value: 'usdt' },
                { label: 'СБП', value: 'sbp' },
              ]}
            />
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Сумма вывода, ₽">
              <input
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={config ? String(config.minWithdraw) : '5000'}
                className={inputClass}
              />
              {config && validAmount && numAmount < config.minWithdraw && (
                <p className="mt-1 text-xs text-red-400">
                  Минимальная сумма вывода — {formatRub(config.minWithdraw)}
                </p>
              )}
            </Field>

            <Field
              label={method === 'usdt' ? 'Адрес кошелька TRC20' : 'Номер телефона для СБП'}
              hint={
                method === 'usdt'
                  ? 'Вам будет отправлено USDT на этот адрес сети TRON'
                  : 'На этот номер придёт перевод по СБП'
              }
            >
              <input
                type="text"
                value={requisites}
                onChange={(e) => setRequisites(e.target.value)}
                placeholder={method === 'usdt' ? 'TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' : '+7 (900) 000-00-00'}
                className={inputClass}
              />
            </Field>

            {method === 'sbp' && (
              <Field label="Банк">
                <input
                  type="text"
                  list="payout-banks"
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  placeholder="Выберите банк или введите свой"
                  className={inputClass}
                />
                <datalist id="payout-banks">
                  {BANKS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </Field>
            )}

            {method === 'usdt' && config && validAmount && (
              <div className="rounded-button border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-sm">
                <span className="text-muted-foreground">К зачислению: </span>
                <span className="font-bold text-blue-400">{usdtAmount.toFixed(2)} USDT</span>
              </div>
            )}
            {method === 'sbp' && config && validAmount && (
              <div className="rounded-button border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Комиссия</span>
                  <span className="font-semibold text-white">−{formatRub(fee)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">К зачислению на счёт</span>
                  <span className="font-bold text-emerald-400">{formatRub(netAmount)}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className={cn(btnPrimary, 'w-full')}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Отправить на вывод
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              Заявка будет обработана администратором. При отказе средства вернутся на баланс.
            </p>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="min-w-0 flex-1 space-y-4">
        <div className="overflow-hidden rounded-card border border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h2 className="text-base font-bold text-white">История начислений</h2>
            <button type="button" className={btnGhost} onClick={exportCsv} disabled={txns.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Экспорт
            </button>
          </div>

          <div className="p-4">
            <DataTable
              columns={txColumns}
              data={txns}
              rowKey={(t) => t.id}
              loading={loading}
              emptyText="Пока нет операций. Комиссия появится после первого депозита привлечённого игрока."
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-white/10 bg-white/[0.02]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-base font-bold text-white">Заявки на вывод</h2>
          </div>
          <div className="p-4">
            <DataTable
              columns={wColumns}
              data={withdrawals}
              rowKey={(w) => w.id}
              loading={loading}
              emptyText="Заявок на вывод пока нет"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
