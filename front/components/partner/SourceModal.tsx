'use client';

import { useEffect } from 'react';
import {
  App,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import {
  partnerApi,
  type AffiliateSource,
  type AffiliateGroup,
  type AffiliateRedirect,
} from '@/lib/api';

interface SourceModalProps {
  open: boolean;
  token: string;
  initial: AffiliateSource | null;
  groups: AffiliateGroup[];
  redirects: AffiliateRedirect[];
  domains: string[];
  onClose: () => void;
  onSaved: () => void;
}

interface SourceFormValues {
  name?: string;
  type: 'link' | 'promo';
  code?: string;
  registrationBonus?: number | null;
  groupId?: string;
  redirectId?: string;
  domain?: string;
  comment?: string;
  isActive?: boolean;
}

export function SourceModal({ open, token, initial, groups, redirects, domains, onClose, onSaved }: SourceModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<SourceFormValues>();
  const sourceType = Form.useWatch('type', form);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.setFieldsValue({
        name: initial.name,
        type: initial.type,
        code: initial.code,
        registrationBonus: initial.registrationBonus,
        groupId: initial.groupId ?? undefined,
        redirectId: initial.redirectId ?? undefined,
        domain: initial.domain ?? undefined,
        comment: initial.comment ?? undefined,
        isActive: initial.isActive,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ type: 'link', isActive: true });
    }
  }, [open, initial, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      type: values.type,
      code: values.code,
      registrationBonus:
        values.registrationBonus === undefined || values.registrationBonus === null
          ? null
          : values.registrationBonus,
      groupId: values.groupId || null,
      redirectId: values.redirectId || null,
      domain: values.type === 'promo' ? null : values.domain || null,
      comment: values.comment || null,
      isActive: values.isActive,
    };
    try {
      if (initial) {
        await partnerApi.updateSource(token, initial.id, payload);
        message.success('Источник обновлён');
      } else {
        await partnerApi.createSource(token, payload);
        message.success('Источник создан');
      }
      onSaved();
      onClose();
    } catch (err) {
      message.error((err as Error).message || 'Ошибка сохранения');
    }
  };

  return (
    <Modal
      open={open}
      title={initial ? 'Редактировать источник' : 'Новый источник'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={initial ? 'Сохранить' : 'Создать'}
      cancelText="Отмена"
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item label="Тип" name="type">
          <Segmented
            block
            options={[
              { label: 'Ссылка', value: 'link' },
              { label: 'Промокод', value: 'promo' },
            ]}
          />
        </Form.Item>

        <Form.Item
          label="Название"
          name="name"
          rules={[{ required: true, message: 'Укажите название' }]}
        >
          <Input placeholder="Например: Telegram-канал #1" maxLength={60} />
        </Form.Item>

        <Form.Item
          label={sourceType === 'promo' ? 'Промокод' : 'Код ссылки'}
          name="code"
          extra="Оставьте пустым, чтобы сгенерировать автоматически"
        >
          <Input placeholder="AFF2026" maxLength={32} style={{ textTransform: 'uppercase' }} />
        </Form.Item>

        <Form.Item
          label={sourceType === 'promo' ? 'Сумма промокода' : 'Бонус при регистрации'}
          name="registrationBonus"
          extra={
            sourceType === 'promo'
              ? 'Сумма, которую получит пользователь за активацию промокода. Пусто — стандартное начисление'
              : 'Оставьте пустым, чтобы использовать стандартный бонус'
          }
        >
          <InputNumber
            min={0}
            step={100}
            style={{ width: '100%' }}
            placeholder="Стандартный"
            suffix="₽"
          />
        </Form.Item>

        {sourceType === 'link' && (
          <Form.Item
            label="Домен ссылки"
            name="domain"
            extra="Пусто — домен, на котором открыта панель"
          >
            <Select
              allowClear
              placeholder="Домен панели"
              options={domains.map((d) => ({ label: d, value: d }))}
            />
          </Form.Item>
        )}

        <Space size={12} style={{ display: 'flex' }} align="start">
          <Form.Item label="Поток" name="groupId" style={{ flex: 1 }}>
            <Select
              allowClear
              placeholder="Без потока"
              options={groups.map((g) => ({ label: g.name, value: g.id }))}
            />
          </Form.Item>
          {sourceType === 'link' && (
            <Form.Item label="Редирект" name="redirectId" style={{ flex: 1 }}>
              <Select
                allowClear
                placeholder="Без редиректа"
                options={redirects.map((r) => ({ label: r.name, value: r.id }))}
              />
            </Form.Item>
          )}
        </Space>

        <Form.Item label="Комментарий" name="comment">
          <Input.TextArea rows={2} placeholder="Заметка для себя" maxLength={300} />
        </Form.Item>

        <Form.Item label="Активен" name="isActive" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Ссылка источника: {typeof window !== 'undefined' ? `${window.location.origin}/r/{code}` : '/r/{code}'}
      </Typography.Text>
    </Modal>
  );
}