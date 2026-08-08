'use client';

import { useEffect } from 'react';
import { App, Form, Input, Modal, Switch } from 'antd';
import { partnerApi, type AffiliateDomain } from '@/lib/api';

interface DomainModalProps {
  open: boolean;
  token: string;
  initial: AffiliateDomain | null;
  onClose: () => void;
  onSaved: () => void;
}

interface DomainFormValues {
  url?: string;
  comment?: string;
  isActive?: boolean;
}

export function DomainModal({ open, token, initial, onClose, onSaved }: DomainModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DomainFormValues>();

  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.setFieldsValue({
        url: initial.url,
        comment: initial.comment ?? undefined,
        isActive: initial.isActive,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ isActive: true });
    }
  }, [open, initial, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (initial) {
        await partnerApi.updateDomain(token, initial.id, {
          url: values.url,
          isActive: values.isActive,
          comment: values.comment || undefined,
        });
        message.success('Домен обновлён');
      } else {
        await partnerApi.createDomain(token, {
          url: values.url,
          isActive: values.isActive,
          comment: values.comment || undefined,
        });
        message.success('Домен добавлен');
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
      title={initial ? 'Редактировать домен' : 'Новый домен'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={initial ? 'Сохранить' : 'Добавить'}
      cancelText="Отмена"
      destroyOnHidden
      width={440}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          label="Домен"
          name="url"
          rules={[{ required: true, message: 'Укажите домен' }]}
          extra="Например: https://casino2.com — на нём будут жить ссылки /r/CODE"
        >
          <Input placeholder="https://casino2.com" maxLength={120} />
        </Form.Item>
        <Form.Item label="Комментарий" name="comment">
          <Input.TextArea rows={2} placeholder="Заметка" maxLength={300} />
        </Form.Item>
        <Form.Item label="Активен" name="isActive" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
