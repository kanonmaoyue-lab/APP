import { useMemo, useState } from 'react';
import { createAuth } from '../auth/service';
import { AuthGate } from '../auth/AuthGate';
import Workspace from './Workspace';
import { Empty, Heading, type Page, Shell } from './components';
export default function App() {
  const [page, setPage] = useState<Page>('today'),
    url = import.meta.env.VITE_SUPABASE_URL?.trim(),
    key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const connection = useMemo(() => {
    try {
      const parsed = new URL(url ?? '');
      if (!key || !['http:', 'https:'].includes(parsed.protocol)) return null;
      return createAuth(parsed.toString(), key);
    } catch {
      return null;
    }
  }, [url, key]);
  if (connection) {
    return (
      <AuthGate auth={connection.auth}>
        {(account) => (
          <Workspace key={account.userId} account={account} client={connection.client} />
        )}
      </AuthGate>
    );
  }
  return (
    <Shell page={page} onPage={setPage} status='云服务尚未配置'>
      <Heading
        eyebrow='MAKE ROOM FOR WHAT MATTERS'
        title='给今天，留一点喜欢。'
        description='行程、学习，还有路上的小风景。'
      />
      <section className='panel'>
        <Empty
          title='你的小日子，从这里开始'
          text='连接云服务后，登录即可保存、同步你的日程与复习笔记。'
        />
      </section>
    </Shell>
  );
}
