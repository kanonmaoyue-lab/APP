import { v5 } from 'uuid';
import { Temporal } from '@js-temporal/polyfill';
import { addDays, addMinutes, resolveLocal } from './dates';
import type { Event, Override, Recurrence } from './types';
export const occurrenceId = (id: string, date: string) => v5(date, id);
export function expand(
  s: Recurrence,
  overrides: Override[],
  range: { start: string; end: string },
): Event[] {
  if (Temporal.PlainDate.from(range.start).until(Temporal.PlainDate.from(range.end)).days > 3660) {
    throw Error('请选择更短日期范围');
  }
  const result: Event[] = [];
  const exceptions = overrides.filter((o) => o.recurrenceId === s.id && !o.deletedAt);
  const longest = Math.max(
    s.template.durationMinutes,
    ...exceptions.map((o) => o.patch.durationMinutes ?? 0),
  );
  const dates = new Set(exceptions.map((o) => o.occurrenceDate));
  for (
    let date = addDays(range.start, -Math.ceil(longest / 1440));
    date <= range.end;
    date = addDays(date, 1)
  ) dates.add(date);
  for (const date of [...dates].sort()) {
    const o = exceptions.find((o) => o.occurrenceDate === date),
      completed = !!o?.patch.completedAt,
      weekday = Temporal.PlainDate.from(date).dayOfWeek;
    if (o?.cancelled || s.deletedAt && !completed) continue;
    if (
      !completed &&
      (date < s.startsOn || s.endsOn && date > s.endsOn || s.rule === 'weekdays' && weekday > 5 ||
        s.rule === 'weekly' && !s.daysOfWeek.includes(weekday))
    ) continue;
    let start: string;
    try {
      start = resolveLocal(date, s.startTime, s.timeZone);
    } catch {
      continue;
    }
    result.push({
      ...s.template,
      plannedDate: date,
      startAt: start,
      endAt: addMinutes(start, s.template.durationMinutes),
      ...o?.patch,
      id: occurrenceId(s.id, date),
      recurrenceId: s.id,
      occurrenceDate: date,
      userId: s.userId,
      version: o?.version ?? s.version,
      sourceVersions: { series: s.version, override: o?.version ?? 0 },
      deletedAt: null,
    });
  }
  return result;
}
