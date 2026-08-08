'use client';

import { useEffect, useState } from 'react';
import { App, Form, Input, Modal, Switch, Typography } from 'antd';
import { partnerApi, type AffiliatePartner } from '@/lib/api';

interface PartnerModalProps {
  open: boolean;
  token: string;
  initial: AffiliatePartner | null;
  onClose: () => void;
  onSaved: () => void;
}

interface PartnerFormValues {
  name?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
  comment?: string;
}

export function PartnerModal({ open, token, initial, onClose, onSaved }: PartnerModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PartnerFormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.setFieldsValue({
        name: initial.name,
        email: initial.email,
        password: '',
        isActive: initial.isActive,
        comment: initial.comment ?? undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ isActive: true });
    }
  }, [open, initial, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (initial) {
        await partnerApi.updatePartner(token, initial.id, {
          name: values.name,
          email: values.email,
          password: values.password || undefined,
          isActive: values.isActive,
          comment: values.comment || undefined,
        });
        message.success('Партнёр обновлён');
      } else {
        const res = await partnerApi.createPartner(token, {
          name: values.name,
          email: values.email,
          password: values.password,
          isActive: values.isActive,
          comment: values.comment || undefined,
        });
        message.success(`Партнёр создан. Email: ${res.email}, пароль: ${res.password}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      message.error((err as Error).message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={initial ? 'Редактировать веб-партнёра' : 'Новый веб-партнёр'}
      okText={initial ? 'Сохранить' : 'Создать'}
      cancelText="Отмена"
      confirmLoading={saving}
      onOk={() => void handleSubmit()}
      onCancel={onClose}
      destroyOnHidden
    >
      {!initial && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 16 }}>
          Партнёр будет заходить в панель по своему email и паролю и видеть только свои офферы и статистику.
        </Typography.Paragraph>
      )}
      <Form form={form} layout="vertical" disabled={saving}>
        <Form.Item
          label="Имя"
          name="name"
          rules={[{ required: true, message: 'Укажите имя' }]}
        >
          <Input placeholder="Веб №1" maxLength={60} />
        </Form.Item>
        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: 'Укажите email' },
            { type: 'email', message: 'Некорректный email' },
          ]}
        >
          <Input placeholder="web1@example.com" autoComplete="off" />
        </Form.Item>
        <Form.Item
          label={initial ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль'}
          name="password"
          rules={[
            { required: !initial, message: 'Укажите пароль' },
            { min: 6, message: 'Не короче 6 символов' },
          ]}
        >
          <Input.Password placeholder="Минимум 6 символов" autoComplete="new-password" />
        </Form.Item>
        <Form.Item label="Комментарий" name="comment">
          <Input placeholder="Например: рекламное агентство" />
        </Form.Item>
        <Form.Item label="Активен" name="isActive" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
