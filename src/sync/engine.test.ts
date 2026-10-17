import { expect, test } from 'vitest';
import { openRepository } from '../data/repository';
import { createEngine, type Transport } from './engine';
import { change, newEvent, type Operation, write } from '../domain/types';
test('network failure preserves queued edits and sends rebased consecutive versions', async () => {
  const r = openRepository(crypto.randomUUID()),
    e = { ...newEvent(r.userId, '2026-10-17'), title: '初稿' };
  await r.enqueue(write(r.userId, [change(e)]));
  await r.enqueue(write(r.userId, [change({ ...e, title: '定稿' })]));
  let offline = true, version = 0;
  const transport: Transport = {
    async pull(cursor) {
      if (offline) throw Error('network');
      return { batches: [], cursor, hasMore: false };
    },
    async apply(op) {
      if (op.command.kind !== 'write') throw Error();
      expect(op.command.changes[0].baseVersion).toBe(version);
      version++;
      return {
        status: 'applied',
        batch: {
          cursor: String(version),
          operationId: op.id,
          entities: [{ ...op.command.changes[0].value!, version }],
        },
      };
    },
  };
  const engine = createEngine({ repository: r, transport });
  await engine.flush();
  expect(await r.pending()).toHaveLength(2);
  offline = false;
  await engine.flush();
  expect(await r.pending()).toHaveLength(0);
  expect((await r.get('events', e.id))?.title).toBe('定稿');
  expect(await r.lease('other', Date.now(), 100)).toBe(true);
  await r.clear();
  r.close();
});
test('persistent conflict blocks dependent edits, independent records still synchronize', async () => {
  const r = openRepository(crypto.randomUUID()),
    e = { ...newEvent(r.userId, '2026-10-17'), title: '本地' },
    a = write(r.userId, [change(e)]),
    b = write(r.userId, [change({ ...e, title: '后续修改' })]),
    other = write(r.userId, [change({ ...e, id: crypto.randomUUID() })]);
  await r.enqueue(a);
  await r.enqueue(b);
  await r.enqueue(other);
  const seen: string[] = [];
  const t: Transport = {
    async pull(cursor) {
      return { batches: [], cursor, hasMore: false };
    },
    async apply(op) {
      seen.push(op.id);
      return op.id === a.id
        ? {
          status: 'conflict',
          reason: 'deleted',
          entities: [{ ...e, version: 2, deletedAt: '2026-10-17T01:00:00Z' }],
        }
        : { status: 'applied', batch: { cursor: '1', operationId: op.id, entities: [] } };
    },
  };
  await createEngine({ repository: r, transport: t }).flush();
  expect(seen).toEqual([a.id, other.id]);
  expect(await r.conflicts()).toHaveLength(1);
  expect((await r.get('events', e.id))?.title).toBe('后续修改');
  await r.resolve(a.id, 'remote');
  expect(await r.pending()).toHaveLength(0);
  expect(await r.list('events')).toHaveLength(0);
  await r.clear();
  r.close();
});
test('pulling pages never skips unseen commits after a jumping acknowledgement', async () => {
  const r = openRepository(crypto.randomUUID());
  let calls = 0;
  const t: Transport = {
    async apply(_op: Operation) {
      throw Error('unused');
    },
    async pull(cursor) {
      calls++;
      const n = Number(cursor) + 1;
      return {
        batches: [{ cursor: String(n), operationId: crypto.randomUUID(), entities: [] }],
        cursor: String(n),
        hasMore: n < 3,
      };
    },
  };
  await createEngine({ repository: r, transport: t }).flush();
  expect(await r.cursor()).toBe('4');
  expect(calls).toBe(4);
  await r.clear();
  r.close();
});
