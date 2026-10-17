import { Temporal } from '@js-temporal/polyfill';
import type { Repository } from '../../data/repository';
import {
  type Change,
  change,
  type Entity,
  type Event,
  meta,
  type Profile,
  type Recurrence,
  write,
} from '../../domain/types';
import { timeAt } from '../../domain/dates';
import { occurrenceId } from '../../domain/recurrence';
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map((
        [k, value],
      ) => [k, sorted(value)]),
    );
  }
  return v;
}
export const content = (entity: Entity | undefined | null) =>
  entity
    ? JSON.stringify(
      sorted({ ...entity, version: 0, updatedAt: '', deletedAt: !!entity.deletedAt }),
    )
    : '';
export async function undoable(repository: Repository, changes: Change[], cursor?: string) {
  const originals = await Promise.all(changes.map((c) => repository.get(c.table, c.id)));
  await repository.enqueue(write(repository.userId, changes, cursor));
  return async () => {
    const current = await Promise.all(changes.map((c) => repository.get(c.table, c.id)));
    for (let i = 0; i < changes.length; i++) {
      if (changes[i].value && content(current[i]) !== content(changes[i].value)) {
        throw Error('事项已改变，请重新查看后操作');
      }
    }
    const inverse = changes.map((c, i) => {
      let value = originals[i] ?? null;
      if (!value && c.value?.table === 'overrides') {
        value = { ...c.value, patch: {}, cancelled: false };
      }
      return { table: c.table, id: c.id, baseVersion: current[i]?.version ?? 0, value };
    });
    await repository.enqueue(write(repository.userId, inverse));
  };
}
export interface SaveOptions {
  profile: Profile;
  scope: 'only' | 'series';
  rule: 'none' | 'daily' | 'weekdays' | 'weekly';
  endsOn: string | null;
}
export async function eventChanges(
  r: Repository,
  event: Event,
  options: SaveOptions,
): Promise<Change[]> {
  if (event.recurrenceId && event.occurrenceDate) {
    const series = await r.get('recurrences', event.recurrenceId);
    if (!series || series.deletedAt) throw Error('重复系列已删除，已完成历史仍保留。');
    const prior = await r.get('overrides', event.id);
    const exception = change({
      ...meta(r.userId),
      ...prior,
      id: event.id,
      table: 'overrides' as const,
      recurrenceId: series.id,
      occurrenceDate: event.occurrenceDate,
      cancelled: false,
      patch: event,
    });
    if (options.scope === 'only') return [exception];
    if (!event.startAt) throw Error('整个系列需要设置开始时间');
    const changes = [
      change({
        ...series,
        template: { ...event, completedAt: null, recurrenceId: null, occurrenceDate: null },
        startTime: timeAt(event.startAt, series.timeZone),
        endsOn: options.endsOn,
      }),
    ];
    if (event.completedAt || prior?.patch.completedAt) changes.push(exception);
    return changes;
  }
  if (options.rule !== 'none') {
    if (!event.startAt || event.reviewItemId) {
      throw Error('重复事项需要开始时间，复习事项单独安排。');
    }
    const series: Recurrence = {
      ...meta(r.userId),
      table: 'recurrences',
      template: { ...event, completedAt: null },
      rule: options.rule,
      startsOn: event.plannedDate,
      endsOn: options.endsOn,
      startTime: timeAt(event.startAt, options.profile.timeZone),
      timeZone: options.profile.timeZone,
      daysOfWeek: [Temporal.PlainDate.from(event.plannedDate).dayOfWeek],
    };
    const changes: Change[] = [change(series)];
    if (event.completedAt) {
      changes.push(change({
        ...meta(r.userId),
        id: occurrenceId(series.id, event.plannedDate),
        table: 'overrides',
        recurrenceId: series.id,
        occurrenceDate: event.plannedDate,
        cancelled: false,
        patch: {
          ...event,
          id: occurrenceId(series.id, event.plannedDate),
          recurrenceId: series.id,
          occurrenceDate: event.plannedDate,
        },
      }));
    }
    if (await r.get('events', event.id)) {
      changes.push({ table: 'events', id: event.id, baseVersion: event.version, value: null });
    }
    return changes;
  }
  return [change(event)];
}
export async function deleteEvent(r: Repository, event: Event, scope: 'only' | 'series') {
  if (event.recurrenceId && event.occurrenceDate) {
    if (scope === 'series') {
      const s = await r.get('recurrences', event.recurrenceId);
      if (s && !s.deletedAt) {
        await r.enqueue(
          write(r.userId, [{
            table: 'recurrences',
            id: s.id,
            baseVersion: s.version,
            value: null,
          }]),
        );
      }
    } else {
      const prior = await r.get('overrides', event.id);
      await r.enqueue(
        write(r.userId, [
          change({
            ...meta(r.userId),
            ...prior,
            id: event.id,
            table: 'overrides',
            recurrenceId: event.recurrenceId,
            occurrenceDate: event.occurrenceDate,
            cancelled: true,
            patch: {},
          }),
        ]),
      );
    }
  } else {await r.enqueue(
      write(r.userId, [{ table: 'events', id: event.id, baseVersion: event.version, value: null }]),
    );}
}
