import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import type { AuthService, Identity } from './service';
import { openRepository } from '../data/repository';
import { change, newEvent, write } from '../domain/types';
function fake(initial: Identity | null) {
  let cb = (who: Identity | null, _event: string) => {
    void who;
  };
  const auth: AuthService = {
    restore: async () => initial,
    listen: (f) => {
      cb = f;
      return () => {};
    },
    signIn: async () => {
      throw Error('邮箱或密码不正确');
    },
    signUp: async () => false,
    reset: async () => {},
    password: async () => {},
    signOut: vi.fn(async () => cb(null, 'SIGNED_OUT')),
  };
  return { auth, emit: (who: Identity | null, event = 'SIGNED_IN') => act(() => cb(who, event)) };
}
test('signup confirmation and login errors do not expose account content', async () => {
  const { auth } = fake(null);
  render(<AuthGate auth={auth}>{() => <p>私人数据</p>}</AuthGate>);
  fireEvent.change(await screen.findByLabelText('邮箱'), { target: { value: 'a@test.com' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: '登录' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('邮箱或密码');
  fireEvent.click(screen.getByRole('button', { name: '注册新账号' }));
  fireEvent.click(screen.getByRole('button', { name: '发送验证邮件' }));
  expect(await screen.findByText(/请到邮箱/)).toBeVisible();
  expect(screen.queryByText('私人数据')).toBeNull();
});
test('restores account, hides old data on switching, handles recovery and external signout', async () => {
  const a = crypto.randomUUID(),
    b = crypto.randomUUID(),
    { auth, emit } = fake({ id: a, email: 'a@test.com' });
  render(<AuthGate auth={auth}>{(account) => <p>{account.userId}</p>}</AuthGate>);
  await screen.findByText(a);
  emit({ id: b, email: 'b@test.com' });
  await screen.findByText(b);
  expect(screen.queryByText(a)).toBeNull();
  emit({ id: b, email: 'b@test.com' }, 'PASSWORD_RECOVERY');
  await screen.findByLabelText('新密码');
  expect(screen.queryByText(b)).toBeNull();
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'newpassword123' } });
  fireEvent.click(screen.getByRole('button', { name: '保存新密码' }));
  await screen.findByText(b);
  emit(null, 'SIGNED_OUT');
  await screen.findByLabelText('邮箱');
  expect(screen.queryByText(b)).toBeNull();
});
test('logout requires explicit pending discard and clears only that account', async () => {
  const id = crypto.randomUUID(), r = openRepository(id);
  await r.enqueue(write(id, [change({ ...newEvent(id, '2026-10-17'), title: '未同步' })]));
  r.close();
  const { auth } = fake({ id, email: 'a@test.com' });
  render(
    <AuthGate auth={auth}>{(a) => <button onClick={() => void a.signOut()}>退出</button>}
    </AuthGate>,
  );
  fireEvent.click(await screen.findByText('退出'));
  await screen.findByText(/还有 1 项/);
  expect(auth.signOut).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '放弃未同步修改并退出' }));
  await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
  const again = openRepository(id);
  await waitFor(async () => expect(await again.pending()).toHaveLength(0));
  again.close();
});
