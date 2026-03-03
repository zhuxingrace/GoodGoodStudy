import { useState } from 'react';
import { Alert, Button, Card, Divider, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';

interface AuthScreenProps {
  isLoading: boolean;
  isSupabaseConfigured: boolean;
  authError?: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
}

export default function AuthScreen({
  isLoading,
  isSupabaseConfigured,
  authError,
  onLogin,
  onSignUp,
  onGoogleLogin,
}: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleAction = async (mode: 'login' | 'signup') => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password.trim()) {
      return;
    }

    if (mode === 'login') {
      await onLogin(trimmedEmail, password);
      return;
    }

    await onSignUp(trimmedEmail, password);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <Card withBorder radius="xl" shadow="sm" className="section-card" style={{ width: 'min(100%, 440px)' }}>
        <Stack spacing="md">
          <div>
            <Title order={2}>GoodGoodStudy</Title>
            <Text size="sm" c="dimmed" mt={4}>
              Sign in to sync entries, journals, and focus sessions securely with Supabase.
            </Text>
          </div>

          {!isSupabaseConfigured ? (
            <Alert color="danger" title="Supabase env vars missing">
              Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before using cloud auth.
            </Alert>
          ) : null}

          {authError ? (
            <Alert color="danger" title="Unable to continue">
              {authError}
            </Alert>
          ) : null}

          <TextInput
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            disabled={!isSupabaseConfigured || isLoading}
          />

          <PasswordInput
            label="Password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            disabled={!isSupabaseConfigured || isLoading}
          />

          <Stack spacing="xs">
            <Button
              onClick={() => void handleAction('login')}
              loading={isLoading}
              disabled={!isSupabaseConfigured}
            >
              Log in
            </Button>
            <Button
              variant="light"
              onClick={() => void handleAction('signup')}
              loading={isLoading}
              disabled={!isSupabaseConfigured}
            >
              Create account
            </Button>
          </Stack>

          <Divider label="or" labelPosition="center" />

          <Button
            variant="subtle"
            onClick={() => void onGoogleLogin()}
            loading={isLoading}
            disabled={!isSupabaseConfigured}
          >
            Continue with Google
          </Button>

          <Text size="xs" c="dimmed">
            Email auth works with Supabase Auth out of the box. Google login appears here once that provider is enabled in Supabase.
          </Text>
        </Stack>
      </Card>
    </div>
  );
}
