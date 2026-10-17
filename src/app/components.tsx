import { type ReactNode, useEffect, useRef } from 'react';
export type Page = 'today' | 'calendar' | 'reviews' | 'routes' | 'settings';
export type CatPose = 'planner' | 'sleep';
export function Cat({ small = false, pose = 'planner' }: { small?: boolean; pose?: CatPose }) {
  return (
    <img
      className={small ? 'cat small' : 'cat'}
      src={'/illustrations/cat-' + pose + '.png'}
      width={160}
      height={160}
      alt=''
      aria-hidden='true'
      draggable={false}
      decoding='async'
    />
  );
}
export function Paw({ className = '' }: { className?: string }) {
  return (
    <svg className={'paw ' + className} viewBox='0 0 32 32' fill='currentColor' aria-hidden='true'>
      <ellipse cx='7' cy='12' rx='3.5' ry='4.5' transform='rotate(-25 7 12)' />
      <ellipse cx='13' cy='7' rx='3.2' ry='4.4' transform='rotate(-8 13 7)' />
      <ellipse cx='21' cy='8' rx='3.2' ry='4.4' transform='rotate(15 21 8)' />
      <ellipse cx='26' cy='14' rx='3.2' ry='4.2' transform='rotate(30 26 14)' />
      <path d='M9 22c0-4 3-8 7-8s8 5 8 9c0 5-5 3-8 3s-7 1-7-4Z' />
    </svg>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className='empty'>
      <Cat pose='sleep' />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
export function Heading(
  { eyebrow, title, description, cat = 'planner' }: {
    eyebrow: string;
    title: string;
    description: string;
    cat?: CatPose;
  },
) {
  return (
    <header className='page-heading'>
      <div>
        <p className='eyebrow'>{eyebrow}</p>
        <h1>{title}</h1>
        <p className='muted'>{description}</p>
      </div>
      <div className='heading-cat' aria-hidden='true'>
        <Cat pose={cat} />
        <Paw className='heading-paw' />
      </div>
    </header>
  );
}
const links: [Page, string, string][] = [
  ['today', '今天', '☀'],
  ['calendar', '日历', '▦'],
  ['reviews', '复习花园', '❀'],
  ['routes', '顺路走走', '⌁'],
  ['settings', '设置', '⚙︎'],
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
              <span aria-hidden='true'>{key === 'today' ? <Paw /> : icon}</span>
              {label}
              {page === key && <Paw className='active-paw' />}
            </button>
          ))}
        </nav>
        <div className='sidebar-companion' aria-hidden='true'>
          <Cat pose='sleep' />
          <p>今天也有猫猫陪你呀</p>
        </div>
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
