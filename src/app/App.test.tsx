import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';
afterEach(() => vi.unstubAllEnvs());
test('unconfigured app offers honest status and navigation without fake saved data', () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
  render(<App />);
  expect(screen.getByRole('navigation')).toBeVisible();
  expect(screen.getByText('云服务尚未配置')).toBeVisible();
  expect(screen.queryByText('已同步')).toBeNull();
});
