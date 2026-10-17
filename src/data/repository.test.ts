import { expect, test } from 'vitest';
import { openRepository } from './repository';
import { change, meta, newEvent, type ReviewItem, write } from '../domain/types';
function event(userId: string, title = '初稿', id = crypto.randomUUID()) {
  return { ...newEvent(userId, '2026-10-17'), id, title };
}
test('offline queue survives reopening and isolates users', async () => {
  const a = openRepository(crypto.randomUUID()),
    b = openRepository(crypto.randomUUID()),
    e = event(a.userId),
    op = write(a.userId, [change(e)]);
  await a.enqueue(op);
  await a.enqueue(op);
  const again = openRepository(a.userId);
  expect(await again.pending()).toHaveLength(1);
  expect(await b.list('events')).toEqual([]);
  expect((await again.list('events'))[0].title).toBe('初稿');
  again.close();
  await a.clear();
  await b.clear();
  a.close();
  b.close();
});
test('acknowledgements rebase later offline edits without replacing their text', async () => {
  const r = openRepository(crypto.randomUUID()),
    e = event(r.userId),
    a = write(r.userId, [change(e)]),
    b = write(r.userId, [change({ ...e, title: '定稿' })]);
  await r.enqueue(a);
  await r.enqueue(b);
  await r.accept({ cursor: '2', operationId: a.id, entities: [{ ...e, version: 1 }] });
  expect((await r.get('events', e.id))?.title).toBe('定稿');
  expect(await r.cursor()).toBe('0');
  const queued = (await r.pending())[0];
  if (queued.command.kind !== 'write') throw Error();
  expect(queued.command.changes[0].baseVersion).toBe(1);
  await r.accept({ cursor: '1', operationId: crypto.randomUUID(), entities: [] });
  await r.accept({ cursor: '2', operationId: a.id, entities: [{ ...e, version: 1 }] });
  expect(await r.cursor()).toBe('2');
  await r.clear();
  r.close();
});
test('review commands project the next date once and mark same-day calendar events', async () => {
  const r = openRepository(crypto.randomUUID()),
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
    },
    e = { ...event(r.userId), reviewItemId: item.id };
  await r.enqueue(write(r.userId, [change(item), change(e)]));
  const cmd = {
    kind: 'review' as const,
    itemId: item.id,
    baseVersion: 0,
    rating: 'remembered' as const,
    reviewDate: '2026-10-17',
  };
  await r.enqueue({ id: crypto.randomUUID(), userId: r.userId, command: cmd });
  await expect(r.enqueue({ id: crypto.randomUUID(), userId: r.userId, command: cmd })).rejects
    .toThrow(/评分/);
  expect((await r.get('reviewItems', item.id))?.nextReviewOn).toBe('2026-10-20');
  expect(await r.list('reviewLogs')).toHaveLength(1);
  expect((await r.get('events', e.id))?.completedAt).toBeTruthy();
  await r.clear();
  r.close();
});
test('delete conflict preserves both versions and saving a copy never revives the tombstone', async () => {
  const r = openRepository(crypto.randomUUID()),
    e = event(r.userId),
    op = write(r.userId, [change(e)]);
  await r.enqueue(op);
  await r.recordConflict(op, [{
    ...e,
    title: '云端',
    version: 2,
    deletedAt: '2026-10-17T01:00:00Z',
  }], 'deleted');
  await expect(r.resolve(op.id, 'local')).rejects.toThrow(/删除/);
  await r.resolve(op.id, 'copy');
  expect((await r.list('events'))[0].id).not.toBe(e.id);
  expect((await r.get('events', e.id))?.deletedAt).toBeTruthy();
  expect(await r.conflicts()).toEqual([]);
  expect(await r.lease('a', 0, 100)).toBe(true);
  expect(await r.lease('b', 50, 100)).toBe(false);
  await r.release('a');
  expect(await r.lease('b', 51, 100)).toBe(true);
  await r.clear();
  r.close();
});
