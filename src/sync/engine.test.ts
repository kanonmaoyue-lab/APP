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
test('a committed operation with a lost acknowledgement is recovered by pull without duplication', async () => {
  const r = openRepository(crypto.randomUUID()),
    e = { ...newEvent(r.userId, '2026-10-17'), title: '不能重复' },
    op = write(r.userId, [change(e)]);
  await r.enqueue(op);
  let committed = false, calls = 0;
  const batch = { cursor: '1', operationId: op.id, entities: [{ ...e, version: 1 }] };
  const transport: Transport = {
    async pull(cursor) {
      return {
        cursor: committed ? '1' : cursor,
        hasMore: false,
        batches: committed && cursor === '0' ? [batch] : [],
      };
    },
    async apply() {
      calls++;
      committed = true;
      throw Error('acknowledgement lost');
    },
  };
  const engine = createEngine({ repository: r, transport });
  await engine.flush();
  expect(await r.pending()).toHaveLength(1);
  await engine.flush();
  expect(await r.pending()).toHaveLength(0);
  expect(calls).toBe(1);
  expect((await r.list('events'))[0].version).toBe(1);
  await r.clear();
  r.close();
});
test('a second engine takes over an expired lease while the first pull is suspended', async () => {
  const r = openRepository(crypto.randomUUID()),
    other = openRepository(r.userId),
    e = { ...newEvent(r.userId, '2026-10-17'), title: '接管' },
    op = write(r.userId, [change(e)]);
  await r.enqueue(op);
  const originalNow = Date.now;
  let clock = originalNow(), release!: () => void, entered!: () => void, calls = 0;
  const arrived = new Promise<void>((resolve) => entered = resolve),
    gate = new Promise<void>((resolve) => release = resolve);
  Date.now = () => clock;
  const empty = async (cursor: string) => ({ batches: [], cursor, hasMore: false });
  const apply: Transport['apply'] = async (command) => {
    calls++;
    return {
      status: 'applied',
      batch: { cursor: '1', operationId: command.id, entities: [{ ...e, version: 1 }] },
    };
  };
  let first = true;
  const a = createEngine({
    repository: r,
    transport: {
      apply,
      async pull(cursor) {
        if (first) {
          first = false;
          entered();
          await gate;
        }
        return empty(cursor);
      },
    },
  });
  const b = createEngine({ repository: other, transport: { apply, pull: empty } });
  try {
    const flight = a.flush();
    await arrived;
    await b.flush();
    expect(calls).toBe(0);
    clock += 8001;
    await b.flush();
    expect(calls).toBe(1);
    release();
    await flight;
    expect(calls).toBe(1);
    expect(await r.pending()).toHaveLength(0);
  } finally {
    release();
    Date.now = originalNow;
    a.stop();
    b.stop();
    await r.clear();
    r.close();
    other.close();
  }
});
