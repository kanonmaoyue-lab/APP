import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { openRepository } from '../src/data/repository';
import { newProfile } from '../src/domain/types';
import { type Page, Shell } from '../src/app/components';
import CalendarPage from '../src/features/calendar/CalendarPage';
import ReviewPage from '../src/features/reviews/ReviewPage';
import SettingsPage from '../src/features/settings/SettingsPage';
import '../src/app/styles.css';
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repository = openRepository(user),
  profile = newProfile(user);
function Harness() {
  const [page, setPage] = useState<Page>('today'), [date, setDate] = useState('2026-10-17');
  return (
    <Shell page={page} onPage={setPage} status='本地测试夹具 · 无云同步'>
      {page === 'reviews'
        ? <ReviewPage repository={repository} profile={profile} />
        : page === 'settings'
        ? <SettingsPage repository={repository} profile={profile} />
        : <CalendarPage repository={repository} profile={profile} date={date} onDate={setDate} />}
    </Shell>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
