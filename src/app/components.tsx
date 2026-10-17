import { type ReactNode, useEffect, useRef } from 'react';
export type Page = 'today' | 'calendar' | 'reviews' | 'routes' | 'settings';
export function Cat({ small = false }: { small?: boolean }) {
  return (
    <svg className={small ? 'cat small' : 'cat'} viewBox='0 0 160 140' aria-hidden='true'>
      <path
        d='M34 66 30 21 65 42Q80 36 96 42L129 21 126 66Q143 114 81 121 17 116 34 66Z'
        fill='#eee6d5'
        stroke='#7a876f'
        strokeWidth='3'
        strokeLinejoin='round'
      />
      <path
        d='m42 46 10 8m57 0 9-8M57 78h1m44 0h1'
        stroke='#617254'
        strokeWidth='6'
        strokeLinecap='round'
      />
      <path
        d='m75 88 6 5 6-5m-6 5v7m-10-2q10 9 20 0'
        fill='none'
        stroke='#617254'
        strokeWidth='2.5'
      />
      <ellipse cx='46' cy='89' rx='9' ry='5' fill='#e6bdb4' />
      <ellipse cx='115' cy='89' rx='9' ry='5' fill='#e6bdb4' />
      <path
        d='M133 110q27-22 13-30'
        fill='none'
        stroke='#7a876f'
        strokeWidth='5'
        strokeLinecap='round'
      />
    </svg>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className='empty'>
      <Cat />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
export function Heading(
  { eyebrow, title, description, flower = '✿' }: {
    eyebrow: string;
    title: string;
    description: string;
    flower?: string;
  },
) {
  return (
    <header className='page-heading'>
      <div>
        <p className='eyebrow'>{eyebrow}</p>
        <h1>{title}</h1>
        <p className='muted'>{description}</p>
      </div>
      <span className='flower' aria-hidden='true'>{flower}</span>
    </header>
  );
}
const links: [Page, string, string][] = [
  ['today', '今天', '☀'],
  ['calendar', '日历', '▦'],
  ['reviews', '复习花园', '❀'],
  ['routes', '顺路走走', '⌁'],
  ['settings', '设置', '⚙'],
];
export function Shell(
  { page, onPage, status, account, children }: {
    page: Page;
    onPage: (p: Page) => void;
    status: ReactNode;
    account?: ReactNode;
    children: ReactNode;
  },
) {
  return (
    <div className='app-layout'>
      <aside className='sidebar'>
        <button className='brand' onClick={() => onPage('today')}>
          <Cat small />
          <span>
            小日子<small>LITTLE DAYS</small>
          </span>
        </button>
        <p className='side-note'>把日子，慢慢过好。</p>
        <nav aria-label='主导航'>
          {links.map(([key, label, icon]) => (
            <button
              key={key}
              className={page === key ? 'nav-item active' : 'nav-item'}
              aria-current={page === key ? 'page' : undefined}
              onClick={() => onPage(key)}
            >
              <span aria-hidden='true'>{icon}</span>
              {label}
              {page === key && <i />}
            </button>
          ))}
        </nav>
        <footer className='sidebar-footer'>
          <div className='sync-status'>{status}</div>
          <small className='account-label'>{account}</small>
          <p>一点计划，一点小确幸。 ✿</p>
        </footer>
      </aside>
      <main>{children}</main>
    </div>
  );
}
export function Dialog(
  { title, onClose, children }: { title: string; onClose: () => void; children: ReactNode },
) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    return () => before?.focus();
  }, []);
  return (
    <div
      className='backdrop'
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className='dialog'
        role='dialog'
        aria-modal='true'
        aria-label={title}
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (e.key === 'Tab') {
            const nodes = ref.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
            );
            if (!nodes?.length) return;
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
