'use client';

import { useEffect, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Switch, Flex, Typography, Divider } from 'antd';
import { DeleteOutlined, PlusOutlined, LinkOutlined } from '@ant-design/icons';
import { partnerApi, type AffiliateRedirect } from '@/lib/api';

interface UrlDraft {
  id?: string;
  url: string;
  weight: number;
  isActive: boolean;
}

interface RedirectModalProps {
  open: boolean;
  token: string;
  initial: AffiliateRedirect | null;
  onClose: () => void;
  onSaved: () => void;
}

interface RedirectFormValues {
  name?: string;
  comment?: string;
}

export function RedirectModal({ open, token, initial, onClose, onSaved }: RedirectModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<RedirectFormValues>();
  const [urls, setUrls] = useState<UrlDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.setFieldsValue({ name: initial.name, comment: initial.comment ?? undefined });
      setUrls(initial.urls.map((u) => ({ id: u.id, url: u.url, weight: u.weight, isActive: u.isActive })));
    } else {
      form.resetFields();
      setUrls([]);
    }
  }, [open, initial, form]);

  const updateUrl = (index: number, patch: Partial<UrlDraft>) => {
    setUrls((prev) => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)));
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const name = values.name?.trim();
    if (!name) {
      message.error('Укажите название');
      return;
    }
    try {
      if (initial) {
        await partnerApi.updateRedirect(token, initial.id, { name, comment: values.comment || undefined });
        const currentIds = new Set(urls.filter((u) => u.id).map((u) => u.id as string));
        for (const old of initial.urls) {
          if (!currentIds.has(old.id)) await partnerApi.deleteRedirectUrl(token, initial.id, old.id);
        }
        for (const u of urls) {
          if (u.id) {
            await partnerApi.updateRedirectUrl(token, initial.id, u.id, { url: u.url, weight: u.weight, isActive: u.isActive });
          } else {
            if (u.url.trim()) await partnerApi.addRedirectUrl(token, initial.id, { url: u.url, weight: u.weight });
          }
        }
        message.success('Редирект обновлён');
      } else {
        const urlsList = urls.filter((u) => u.url.trim()).map((u) => u.url.trim());
        await partnerApi.createRedirect(token, { name, comment: values.comment || undefined, urls: urlsList });
        message.success('Редирект создан');
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
      title={initial ? 'Редактировать редирект' : 'Новый редирект'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={initial ? 'Сохранить' : 'Создать'}
      cancelText="Отмена"
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item label="Название" name="name" rules={[{ required: true, message: 'Укажите название' }]}>
          <Input placeholder="Например: Лендинг 1" maxLength={60} />
        </Form.Item>
        <Form.Item label="Комментарий" name="comment">
          <Input.TextArea rows={2} placeholder="Заметка" maxLength={300} />
        </Form.Item>
      </Form>

      <Divider style={{ margin: '8px 0 12px' }} />
      <Flex align="center" justify="space-between" className="mb-2">
        <Typography.Text strong style={{ fontSize: 13 }}>
          Ссылки (вес = частота показа)
        </Typography.Text>
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => setUrls((prev) => [...prev, { url: '', weight: 1, isActive: true }])}
        >
          Добавить
        </Button>
      </Flex>

      <Flex vertical gap={8}>
        {urls.map((u, i) => (
          <Flex key={u.id ?? `new-${i}`} gap={8} align="center">
            <LinkOutlined style={{ color: '#999', flexShrink: 0 }} />
            <Input
              placeholder="https://litgame.fun"
              value={u.url}
              onChange={(e) => updateUrl(i, { url: e.target.value })}
              style={{ flex: 1 }}
            />
            <InputNumber
              min={1}
              value={u.weight}
              onChange={(v) => updateUrl(i, { weight: v ?? 1 })}
              style={{ width: 70 }}
            />
            <Switch checked={u.isActive} onChange={(v) => updateUrl(i, { isActive: v })} size="small" />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))}
            />
          </Flex>
        ))}
        {urls.length === 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Ссылок пока нет. Если ссылки не заданы, переходы ведут на главную площадки.
          </Typography.Text>
        )}
      </Flex>
      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
        Можно указать домен с протоколом или без него, например: https://litgame.fun
      </Typography.Text>
    </Modal>
  );
}
