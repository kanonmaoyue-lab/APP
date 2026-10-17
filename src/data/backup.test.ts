import { expect, test } from 'vitest';
import { openRepository } from './repository';
import { backup } from './backup';
import { change, meta, newEvent, newProfile, type ReviewItem, write } from '../domain/types';
test('backup contains offline account entities and conflicts, never auth storage or raw network requests', async () => {
  const r = openRepository(crypto.randomUUID()),
    e = { ...newEvent(r.userId, '2026-10-17'), title: '离线日程' },
    item: ReviewItem = {
      ...meta(r.userId),
      table: 'reviewItems',
      title: '高数',
      notes: '极限',
      learnedOn: '2026-10-15',
      nextReviewOn: '2026-10-16',
      level: 0,
      durationMinutes: 20,
      categoryId: null,
      archivedAt: null,
    };
  await r.enqueue(write(r.userId, [change(e), change(item)]));
  localStorage.setItem('supabase.auth.token', 'private-test-secret');
  const data = await backup(r, newProfile(r.userId));
  expect(data.formatVersion).toBe(1);
  expect(data.tables.events[0].title).toBe('离线日程');
  expect(data.tables.reviewItems).toHaveLength(1);
  expect(data.tables.overrides).toEqual([]);
  expect(data.sync.unsyncedCount).toBe(1);
  expect(JSON.stringify(data)).not.toContain('private-test-secret');
  expect(data).not.toHaveProperty('operations');
  localStorage.clear();
  await r.clear();
  r.close();
});
