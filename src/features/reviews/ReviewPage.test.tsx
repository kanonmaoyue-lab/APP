import { expect, test } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { openRepository } from '../../data/repository';
import { change, meta, newProfile, type ReviewItem, write } from '../../domain/types';
import ReviewPage from './ReviewPage';
test('overdue item appears once, scheduling is unique, scoring advances and completes its same-day event offline', async () => {
  const r = openRepository(crypto.randomUUID()),
    item: ReviewItem = {
      ...meta(r.userId),
      table: 'reviewItems',
      title: '高数 · 极限',
      notes: '先看定义再做例题',
      learnedOn: '2026-10-14',
      level: 0,
      nextReviewOn: '2026-10-15',
      durationMinutes: 20,
      categoryId: null,
      archivedAt: null,
    };
  await r.enqueue(write(r.userId, [change(item)]));
  const { unmount } = render(
    <ReviewPage repository={r} profile={newProfile(r.userId)} currentDate='2026-10-17' />,
  );
  expect(await screen.findAllByRole('heading', { name: item.title })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '放入今日日程' }));
  const scheduled = await screen.findByRole('button', { name: '已在今日日程' });
  await waitFor(() => expect(scheduled).toBeEnabled());
  fireEvent.click(scheduled);
  await waitFor(() => expect(screen.getByRole('button', { name: '记住了' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '记住了' }));
  await waitFor(async () =>
    expect((await r.get('reviewItems', item.id))?.nextReviewOn).toBe('2026-10-20')
  );
  expect(await r.list('events')).toHaveLength(1);
  expect((await r.list('events'))[0].completedAt).toBeTruthy();
  expect(await r.list('reviewLogs')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '全部主题' }));
  expect(await screen.findByText(/今天已评分/)).toBeVisible();
  unmount();
  await r.clear();
  r.close();
});
