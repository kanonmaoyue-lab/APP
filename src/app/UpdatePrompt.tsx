import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
async function hasPending() {
  if (typeof indexedDB.databases !== 'function') {
    throw Error('无法确认本地修改状态，请同步并导出备份后重新打开应用。');
  }
  const databases = await indexedDB.databases();
  for (const db of databases) {
    if (!db.name?.startsWith('little-days:')) continue;
    const count = await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open(db.name!);
      request.onerror = () => reject(Error('本地数据暂时不可读，请稍后重试更新。'));
      request.onblocked = () => reject(Error('其他页面正在使用应用，请关闭其他页面后重试。'));
      request.onsuccess = () => {
        const connection = request.result;
        if (!connection.objectStoreNames.contains('queue')) {
          connection.close();
          resolve(0);
          return;
        }
        try {
          const tx = connection.transaction('queue'), query = tx.objectStore('queue').count();
          query.onsuccess = () => {
            connection.close();
            resolve(query.result);
          };
          query.onerror = () => {
            connection.close();
            reject(Error('无法确认未同步修改，请稍后重试。'));
          };
        } catch {
          connection.close();
          reject(Error('无法确认未同步修改，请稍后重试。'));
        }
      };
    });
    if (count) return true;
  }
  return false;
}
export default function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({ immediate: true }),
    [standalone, setStandalone] = useState(true),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setStandalone(
      matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in navigator && !!navigator.standalone),
    );
  }, []);
  if (!needRefresh) {
    return standalone
      ? null
      : <p className='install-hint'>iPad Safari：分享 → 添加到主屏幕，让小日子住进桌面。</p>;
  }
  return (
    <div className='update-banner' role='status'>
      <span>新版本已经准备好。</span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            if (await hasPending()) {
              setMessage('请先同步或导出未同步修改，再更新应用。');
              return;
            }
            await updateServiceWorker(true);
          } catch (e) {
            setMessage(e instanceof Error ? e.message : '暂时无法更新，请稍后重试。');
          } finally {
            setBusy(false);
          }
        }}
      >
        更新应用
      </button>
      {message && <span>{message}</span>}
    </div>
  );
}
