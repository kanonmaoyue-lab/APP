import { expect, test } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { openRepository } from '../../data/repository';
import { change, meta, newEvent, newProfile, type Recurrence, write } from '../../domain/types';
import { expand, occurrenceId } from '../../domain/recurrence';
import { deleteEvent, eventChanges } from './commands';
import EventEditor from './EventEditor';
const day = '2026-10-17';
function series(userId: string): Recurrence {
  return {
    ...meta(userId),
    version: 1,
    table: 'recurrences',
    template: { ...newEvent(userId, day), title: '学习' },
    rule: 'daily',
    startsOn: day,
    endsOn: null,
    startTime: '09:00',
    timeZone: 'Asia/Shanghai',
    daysOfWeek: [6],
  };
}
test('stale occurrence edit and deletion reject changed override and series snapshots', async () => {
  const r = openRepository(crypto.randomUUID()),
    s = series(r.userId),
    o = {
      ...meta(r.userId),
      version: 1,
      id: occurrenceId(s.id, day),
      table: 'overrides' as const,
      recurrenceId: s.id,
      occurrenceDate: day,
      cancelled: false,
      patch: { notes: '旧备注' },
    };
  await r.accept({ cursor: '1', operationId: crypto.randomUUID(), entities: [s, o] });
  const old = expand(s, [o], { start: day, end: day }).find((e) => e.occurrenceDate === day)!;
  await r.accept({
    cursor: '2',
    operationId: crypto.randomUUID(),
    entities: [{ ...o, version: 2, patch: { notes: '云端新备注' } }],
  });
  const options = {
    profile: newProfile(r.userId),
    scope: 'only' as const,
    rule: 'none' as const,
    endsOn: null,
  };
  await expect(eventChanges(r, { ...old, title: '新标题' }, options)).rejects.toThrow(/已改变/);
  await expect(deleteEvent(r, old, 'only')).rejects.toThrow(/已改变/);
  const fresh = expand(s, [{ ...o, version: 2 }], { start: day, end: day }).find((e) =>
    e.occurrenceDate === day
  )!;
  await r.accept({
    cursor: '3',
    operationId: crypto.randomUUID(),
    entities: [{ ...s, version: 2 }],
  });
  await expect(eventChanges(r, fresh, { ...options, scope: 'series' })).rejects.toThrow(/已改变/);
  await r.clear();
  r.close();
});
test('an occurrence write atomically guards its parent series and strips client snapshots', async () => {
  const r = openRepository(crypto.randomUUID()), s = series(r.userId);
  await r.accept({ cursor: '1', operationId: crypto.randomUUID(), entities: [s] });
  const e = expand(s, [], { start: day, end: day }).find((e) => e.occurrenceDate === day)!;
  const changes = await eventChanges(r, { ...e, title: '新标题' }, {
    profile: newProfile(r.userId),
    scope: 'only',
    rule: 'none',
    endsOn: null,
  });
  expect(changes.find((c) => c.table === 'recurrences')?.baseVersion).toBe(1);
  const exception = changes.find((c) => c.table === 'overrides')!;
  expect(exception.baseVersion).toBe(0);
  expect(JSON.stringify(exception.value)).not.toContain('sourceVersions');
  await r.clear();
  r.close();
});
test('moved exceptions remain visible at destination, including route single-day expansion', () => {
  const s = series(crypto.randomUUID()),
    moved = {
      ...meta(s.userId),
      id: occurrenceId(s.id, day),
      table: 'overrides' as const,
      recurrenceId: s.id,
      occurrenceDate: day,
      cancelled: false,
      patch: {
        plannedDate: '2026-12-17',
        startAt: '2026-12-17T01:00:00Z',
        endAt: '2026-12-17T01:30:00Z',
      },
    };
  for (
    const range of [{ start: '2026-12-01', end: '2026-12-31' }, {
      start: '2026-12-17',
      end: '2026-12-17',
    }]
  ) {
    expect(expand(s, [moved], range).filter((e) => e.id === moved.id)).toHaveLength(1);
  }
});
test('title-only editing preserves an ambiguous instant and road-derived seconds', async () => {
  for (const instant of ['2026-11-01T06:30:00Z', '2026-11-01T06:30:27Z']) {
    let saved: string | null | undefined;
    const e = {
      ...newEvent(crypto.randomUUID(), '2026-11-01'),
      title: '原预约',
      startAt: instant,
      endAt: '2026-11-01T07:00:00Z',
    };
    const { unmount } = render(
      <EventEditor
        event={e}
        profile={{ ...newProfile(e.userId), timeZone: 'America/New_York' }}
        categories={[]}
        onSave={async (value) => {
          saved = value.startAt;
        }}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('事项名称'), { target: { value: '改标题' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事项' }));
    await waitFor(() => expect(saved).toBe(instant));
    unmount();
  }
});
