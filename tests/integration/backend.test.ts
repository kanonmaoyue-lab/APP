import { expect, test } from 'vitest';
import { createUser } from '../../scripts/local.mjs';
import {
  change,
  meta,
  newEvent,
  type Recurrence,
  type ReviewItem,
  write,
} from '../../src/domain/types';
import { addDays, today } from '../../src/domain/dates';
test('concurrent commits paginate without gaps and stale route adoption is atomic', async () => {
  const u = await createUser();
  try {
    const events = Array.from(
      { length: 8 },
      (_, i) => ({ ...newEvent(u.userId, today()), title: '事项' + i }),
    );
    const results = await Promise.all(
      events.map((e) =>
        u.client.rpc('apply_operation', { operation: write(u.userId, [change(e)]) })
      ),
    );
    expect(results.every((r) => !r.error && r.data.status === 'applied')).toBe(true);
    let cursor = '0';
    const seen = new Set();
    for (let i = 0; i < 8; i++) {
      const r = await u.client.rpc('pull_changes', { after_cursor: cursor, limit_groups: 1 });
      expect(r.error).toBeNull();
      expect(r.data.batches).toHaveLength(1);
      seen.add(r.data.batches[0].entities[0].id);
      cursor = r.data.cursor;
    }
    expect(seen.size).toBe(8);
    const stale = write(u.userId, [change({ ...events[0], version: 1, title: '不应采用' })], '0');
    const response = await u.client.rpc('apply_operation', { operation: stale });
    expect(response.data.status).toBe('conflict');
    const own = await u.client.from('records').select('payload').eq('id', events[0].id);
    expect(own.data?.[0]?.payload.title).toBe(events[0].title);
  } finally {
    await u.cleanup();
  }
});
test('concurrent daily scoring advances once and another account cannot read it', async () => {
  const a = await createUser(), b = await createUser();
  try {
    const item: ReviewItem = {
      ...meta(a.userId),
      table: 'reviewItems',
      title: '高数',
      notes: '极限',
      learnedOn: addDays(today(), -2),
      nextReviewOn: addDays(today(), -1),
      level: 0,
      durationMinutes: 20,
      categoryId: null,
      archivedAt: null,
    };
    expect(
      (await a.client.rpc('apply_operation', { operation: write(a.userId, [change(item)]) })).error,
    ).toBeNull();
    const command = {
      kind: 'review',
      itemId: item.id,
      baseVersion: 1,
      rating: 'remembered',
      reviewDate: today(),
    };
    const results = await Promise.all(
      [1, 2].map(() =>
        a.client.rpc('apply_operation', {
          operation: { id: crypto.randomUUID(), userId: a.userId, command },
        })
      ),
    );
    expect(results.filter((r) => r.data.status === 'applied')).toHaveLength(1);
    expect(results.filter((r) => r.data.status === 'conflict')).toHaveLength(1);
    const records = await a.client.from('records').select('payload').eq('kind', 'reviewItems');
    expect(records.data?.[0]?.payload.nextReviewOn).toBe(addDays(today(), 3));
    const other = await b.client.from('records').select('id');
    expect(other.data).toEqual([]);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});
test('stale route retains mandatory regeneration when a selected record also changed', async () => {
  const u = await createUser();
  try {
    const e = { ...newEvent(u.userId, today()), title: '远端新版本' };
    expect(
      (await u.client.rpc('apply_operation', { operation: write(u.userId, [change(e)]) })).error,
    ).toBeNull();
    const stale = write(u.userId, [change({ ...e, title: '过时建议' })], '0');
    const result = await u.client.rpc('apply_operation', { operation: stale });
    expect(result.error).toBeNull();
    expect(result.data.reason).toBe('scheduleChanged');
  } finally {
    await u.cleanup();
  }
});
test('concurrent route quota calls atomically admit at most twenty requests per account minute', async () => {
  const u = await createUser();
  try {
    const remaining = 60000 - Date.now() % 60000;
    if (remaining < 5000) await new Promise((resolve) => setTimeout(resolve, remaining + 50));
    const before = Math.floor(Date.now() / 60000);
    const results = await Promise.all(
      Array.from(
        { length: 40 },
        () => u.admin.rpc('consume_route_quota', { account_id: u.userId }),
      ),
    );
    expect(Math.floor(Date.now() / 60000)).toBe(before);
    expect(results.every((r) => !r.error)).toBe(true);
    expect(results.filter((r) => r.data === true)).toHaveLength(20);
    expect(results.filter((r) => r.data === false)).toHaveLength(20);
  } finally {
    await u.cleanup();
  }
});
test('an occurrence parent CAS prevents a concurrent series edit from being overwritten', async () => {
  const u = await createUser();
  try {
    const series: Recurrence = {
      ...meta(u.userId),
      table: 'recurrences' as const,
      template: { ...newEvent(u.userId, today()), title: '系列' },
      rule: 'daily',
      startsOn: today(),
      endsOn: null,
      startTime: '09:00',
      timeZone: 'Asia/Shanghai',
      daysOfWeek: [1],
    };
    const created = await u.client.rpc('apply_operation', {
      operation: write(u.userId, [change(series)]),
    });
    expect(created.error).toBeNull();
    expect(created.data.status).toBe('applied');
    const current = { ...series, version: 1 };
    const remote = await u.client.rpc('apply_operation', {
      operation: write(u.userId, [
        change({ ...current, template: { ...series.template, notes: '云端新备注' } }),
      ]),
    });
    expect(remote.data.status).toBe('applied');
    const { occurrenceId } = await import('../../src/domain/recurrence');
    const override = {
      ...meta(u.userId),
      id: occurrenceId(series.id, today()),
      table: 'overrides' as const,
      recurrenceId: series.id,
      occurrenceDate: today(),
      cancelled: false,
      patch: { title: '旧快照修改' },
    };
    const result = await u.client.rpc('apply_operation', {
      operation: write(u.userId, [change(current), change(override)]),
    });
    expect(result.data.status).toBe('conflict');
    expect((await u.client.from('records').select('id').eq('kind', 'overrides')).data).toEqual([]);
  } finally {
    await u.cleanup();
  }
});
