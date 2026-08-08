'use client';

import { useEffect } from 'react';
import { App, Form, Input, InputNumber, Modal } from 'antd';
import { partnerApi, type AffiliateGroup } from '@/lib/api';

interface GroupModalProps {
  open: boolean;
  token: string;
  initial: AffiliateGroup | null;
  onClose: () => void;
  onSaved: () => void;
}

interface GroupFormValues {
  name?: string;
  commissionPercent?: number;
  comment?: string;
}

export function GroupModal({ open, token, initial, onClose, onSaved }: GroupModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<GroupFormValues>();

  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.setFieldsValue({
        name: initial.name,
        commissionPercent: initial.commissionPercent,
        comment: initial.comment ?? undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ commissionPercent: 0 });
    }
  }, [open, initial, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (initial) {
        await partnerApi.updateGroup(token, initial.id, {
          name: values.name,
          commissionPercent: values.commissionPercent ?? 0,
          comment: values.comment || undefined,
        });
        message.success('Поток обновлён');
      } else {
        await partnerApi.createGroup(token, {
          name: values.name,
          commissionPercent: values.commissionPercent ?? 0,
          comment: values.comment || undefined,
        });
        message.success('Поток создан');
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
      title={initial ? 'Редактировать поток' : 'Новый поток'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={initial ? 'Сохранить' : 'Создать'}
      cancelText="Отмена"
      destroyOnHidden
      width={440}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item label="Название" name="name" rules={[{ required: true, message: 'Укажите название' }]}>
          <Input placeholder="Например: Основной поток" maxLength={60} />
        </Form.Item>
        <Form.Item
          label="Комиссия, %"
          name="commissionPercent"
          extra="Процент от депозитов привлечённых игроков"
        >
          <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} suffix="%" />
        </Form.Item>
        <Form.Item label="Комментарий" name="comment">
          <Input.TextArea rows={2} placeholder="Заметка" maxLength={300} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
