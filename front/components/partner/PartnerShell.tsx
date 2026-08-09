'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Layout,
  Segmented,
  Button,
  Flex,
  Form,
  Input,
  Typography,
  Space,
} from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  LockOutlined,
  ThunderboltFilled,
  AppstoreOutlined,
  BarChartOutlined,
  TeamOutlined,
  WalletOutlined,
  // TrophyOutlined, // Лидерборд временно отключён
  SettingOutlined,
} from '@ant-design/icons';
import { partnerApi, type AffiliatePartner } from '@/lib/api';

const TOKEN_KEY = 'partner_token';
const PROFILE_KEY = 'partner_profile';

interface PartnerShellProps {
  children: (auth: { token: string; partner: AffiliatePartner }) => ReactNode;
}

export function PartnerShell({ children }: PartnerShellProps) {
  const [token, setToken] = useState<string | null>(null);
  const [partner, setPartner] = useState<AffiliatePartner | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [registered, setRegistered] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
    const savedProfile = localStorage.getItem(PROFILE_KEY);
    if (savedProfile) {
      try {
        setPartner(JSON.parse(savedProfile) as AffiliatePartner);
      } catch {
        // ignore
      }
    }
  }, []);

  const handleLogin = async () => {
    const e = email.trim();
    if (!e || !password) return;
    setLoggingIn(true);
    setError(null);
    try {
      const res = await partnerApi.login(e, password);
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(res.partner));
      setToken(res.token);
      setPartner(res.partner);
      setPassword('');
      setEmail('');
      setName('');
    } catch (err) {
      setError((err as Error).message || 'Не удалось войти');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleRegister = async () => {
    const n = name.trim();
    const e = email.trim();
    if (!n || !e || !password) return;
    setLoggingIn(true);
    setError(null);
    try {
      await partnerApi.register(n, e, password);
      setRegistered(true);
      setMode('login');
      setError(null);
      setPassword('');
      setEmail('');
      setName('');
    } catch (err) {
      setError((err as Error).message || 'Не удалось зарегистрироваться');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    setToken(null);
    setPartner(null);
  };

  if (registered) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: '#FAFAFA' }}>
        <div
          className=" rounded-2xl border bg-white p-6"
          style={{ borderColor: 'rgba(0,0,0,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}
        >
          <Flex align="center" gap={8} className="mb-2">
            <ThunderboltFilled style={{ color: '#0070F3', fontSize: 20 }} />
            <Typography.Title level={4} style={{ margin: 0 }}>Партнёрская панель</Typography.Title>
          </Flex>
          <Typography.Title level={5} style={{ marginBottom: 8 }}>Заявка отправлена</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
            Аккаунт появится в панели после того, как владелец одобрит регистрацию. Как только доступ будет открыт, вы сможете войти.
          </Typography.Paragraph>
          <Button block onClick={() => setRegistered(false)}>
            Вернуться ко входу
          </Button>
        </div>
      </div>
    );
  }

  if (!token || !partner) {
    const isRegister = mode === 'register';
    return (
      <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: '#FAFAFA' }}>
        <div
          className=" rounded-2xl border bg-white p-6"
          style={{ borderColor: 'rgba(0,0,0,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}
        >
          <Flex align="center" gap={8} className="mb-1">
            <ThunderboltFilled style={{ color: '#0070F3', fontSize: 20 }} />
            <Typography.Title level={4} style={{ margin: 0 }}>Партнёрская панель</Typography.Title>
          </Flex>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {isRegister ? 'Зарегистрируйтесь, чтобы начать зарабатывать' : 'Войдите в аккаунт веб-партнёра'}
          </Typography.Text>
          <Form
            layout="vertical"
            onFinish={isRegister ? handleRegister : handleLogin}
            className="mt-4"
          >
            {isRegister && (
              <Form.Item style={{ marginBottom: 12 }}>
                <Input
                  prefix={<UserOutlined style={{ color: '#999' }} />}
                  placeholder="Имя"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  size="large"
                />
              </Form.Item>
            )}
            <Form.Item style={{ marginBottom: 12 }}>
              <Input
                prefix={<UserOutlined style={{ color: '#999' }} />}
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                size="large"
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#999' }} />}
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                size="large"
              />
            </Form.Item>
            {error && (
              <Typography.Text type="danger" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                {error}
              </Typography.Text>
            )}
            <Button type="primary" htmlType="submit" loading={loggingIn} block size="large">
              {isRegister ? 'Зарегистрироваться' : 'Войти'}
            </Button>
            <Flex justify="center" style={{ marginTop: 12 }}>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setMode(isRegister ? 'login' : 'register');
                  setError(null);
                }}
              >
                {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
              </Button>
            </Flex>
          </Form>
        </div>
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#FAFAFA' }}>
      <PartnerHeader partner={partner} onLogout={handleLogout} />
      <Layout.Content style={{ padding: 20 }}>{children({ token, partner })}</Layout.Content>
    </Layout>
  );
}

function PartnerHeader({ partner, onLogout }: { partner: AffiliatePartner; onLogout: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  // Лидерборд временно отключён:
  //   pathname.startsWith('/partner/leaderboard') ? '/partner/leaderboard'
  //   :
  const value = pathname.startsWith('/partner/referrals')
    ? '/partner/referrals'
    : pathname.startsWith('/partner/payout')
      ? '/partner/payout'
      : pathname.startsWith('/partner/stats')
        ? '/partner/stats'
        : pathname.startsWith('/partner/settings')
          ? '/partner/settings'
          : '/partner';

  const items = [
    { label: 'Офферы', value: '/partner', icon: <AppstoreOutlined /> },
    { label: 'Статистика', value: '/partner/stats', icon: <BarChartOutlined /> },
    { label: 'Рефералы', value: '/partner/referrals', icon: <TeamOutlined /> },
    { label: 'Выплаты', value: '/partner/payout', icon: <WalletOutlined /> },
    // { label: 'Лидерборд', value: '/partner/leaderboard', icon: <TrophyOutlined /> },
    ...(partner.isOwner ? [{ label: 'Настройки', value: '/partner/settings', icon: <SettingOutlined /> }] : []),
  ];

  return (
    <Layout.Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        background: '#fff',
        padding: '0 20px',
        height: 64,
        borderBottom: '1px solid rgba(0,0,0,0.04)',
      }}
    >
      <Flex align="center" gap={16} wrap="wrap">
        <Space size={8} align="center">
          <ThunderboltFilled style={{ color: '#0070F3', fontSize: 18 }} />
          <Typography.Text strong style={{ fontSize: 15 }}>
            LITGAME <Typography.Text type="secondary">· Партнёрка</Typography.Text>
          </Typography.Text>
        </Space>
        <Segmented
          value={value}
          options={items}
          onChange={(v) => router.push(v as string)}
          size="middle"
        />
      </Flex>
      <Flex align="center" gap={12}>
        <Typography.Text style={{ fontSize: 13 }}>
          {partner.name}{partner.isOwner ? <span style={{ color: '#0070F3' }}> · владелец</span> : null}
        </Typography.Text>
        <Button type="text" icon={<LogoutOutlined />} onClick={onLogout}>
          Выйти
        </Button>
      </Flex>
    </Layout.Header>
  );
}
