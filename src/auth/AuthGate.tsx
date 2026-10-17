import { type ReactNode, useEffect, useState } from 'react';
import { openRepository, type Repository } from '../data/repository';
import type { AuthService, Identity } from './service';
export interface Account {
  userId: string;
  session: Identity;
  repository: Repository;
  signOut: () => Promise<void>;
  reauthenticate: () => void;
}
export function AuthGate(
  { auth, children }: { auth: AuthService; children: (account: Account) => ReactNode },
) {
  const [identity, setIdentity] = useState<Identity | null>(null),
    [ready, setReady] = useState(false),
    [recovery, setRecovery] = useState(false),
    [reauth, setReauth] = useState(false),
    [store, setStore] = useState<Repository | null>(null),
    [pending, setPending] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true, seen = false;
    const off = auth.listen((who, event) => {
      if (!active) return;
      seen = true;
      setIdentity(who);
      setReady(true);
      setReauth(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    void auth.restore().then((who) => {
      if (active && !seen) {
        setIdentity(who);
        setReady(true);
      }
    }).catch(() => {
      if (active) {
        setError('暂时无法恢复登录，请联网重试。');
        setReady(true);
      }
    });
    return () => {
      active = false;
      off();
    };
  }, [auth]);
  useEffect(() => {
    if (!identity) {
      setStore(null);
      return;
    }
    const repository = openRepository(identity.id);
    setStore(repository);
    return () => repository.close();
  }, [identity?.id]);
  async function exit(discard = false) {
    if (!store) return;
    try {
      const q = await store.pending();
      if (q.length && !discard) {
        setPending(q.length);
        return;
      }
      const id = store.userId;
      await auth.signOut();
      const cleanup = openRepository(id);
      try {
        await cleanup.clear();
      } finally {
        cleanup.close();
      }
      setPending(0);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '退出失败，修改仍保留');
    }
  }
  if (!ready) return <div className='empty' role='status'>正在打开你的小日子…</div>;
  if (!identity || recovery || reauth) {
    return (
      <AuthForm
        auth={auth}
        recovery={recovery}
        recovered={() => setRecovery(false)}
        initialError={error}
      />
    );
  }
  if (!store || store.userId !== identity.id) return <p role='status'>正在打开账号…</p>;
  return (
    <>
      {children({
        userId: identity.id,
        session: identity,
        repository: store,
        signOut: () => exit(),
        reauthenticate: () => setReauth(true),
      })}
      {error && <p className='error' role='alert'>{error}</p>}
      {pending > 0 && (
        <div className='backdrop'>
          <section className='dialog' role='dialog' aria-modal='true' aria-label='未同步修改'>
            <h2>还有 {pending} 项修改未同步</h2>
            <p>可以联网同步后再退出，也可以明确放弃这些修改。</p>
            <div className='actions'>
              <button onClick={() => setPending(0)}>返回继续同步</button>
              <button
                className='danger'
                onClick={() => void exit(true)}
              >
                放弃未同步修改并退出
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function AuthForm(
  { auth, recovery, recovered, initialError }: {
    auth: AuthService;
    recovery: boolean;
    recovered: () => void;
    initialError: string;
  },
) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(initialError),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className='auth-page'>
      <section className='panel auth-card'>
        <p className='auth-cat' aria-hidden='true'>ฅ^•ﻌ•^ฅ</p>
        <p className='eyebrow'>LITTLE DAYS</p>
        <h1>
          {recovery
            ? '换一个新密码'
            : mode === 'signup'
            ? '开始你的小日子'
            : mode === 'reset'
            ? '找回你的小日子'
            : '欢迎回来，慢慢来。'}
        </h1>
        <p className='muted'>一点计划，一点小确幸。</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            setNotice('');
            try {
              if (recovery) {
                await auth.password(password);
                recovered();
              } else if (mode === 'login') await auth.signIn(email, password);
              else if (mode === 'signup') {
                if (!await auth.signUp(email, password)) {
                  setNotice(
                    '请到邮箱点击验证链接，再回来登录。',
                  );
                }
              } else {
                await auth.reset(email);
                setNotice('若账号存在，重置邮件已发送，请查看邮箱。');
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : '暂时无法连接，请稍后重试');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className='stack'>
            {!recovery && (
              <label>
                邮箱<input
                  type='email'
                  required
                  autoComplete='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {(recovery || mode !== 'reset') && (
              <label>
                {recovery ? '新密码' : '密码'}
                <input
                  type='password'
                  required
                  minLength={mode === 'login' && !recovery ? 1 : 8}
                  autoComplete={recovery || mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            <button className='primary' disabled={busy}>
              {busy
                ? '请稍候…'
                : recovery
                ? '保存新密码'
                : mode === 'login'
                ? '登录'
                : mode === 'signup'
                ? '发送验证邮件'
                : '发送重置邮件'}
            </button>
          </div>
        </form>
        {error && <p role='alert' className='error'>{error}</p>}
        {notice && <p role='status' className='notice'>{notice}</p>}
        {!recovery && (
          <div className='row'>
            <button
              className='text'
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setNotice('');
                setError('');
              }}
            >
              {mode === 'login' ? '注册新账号' : '返回登录'}
            </button>
            {mode === 'login' && (
              <button className='text' onClick={() => setMode('reset')}>忘记密码</button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
