import { Temporal } from '@js-temporal/polyfill';
import type { Event, Place } from './types';
export const addDays = (date: string, n: number) =>
  Temporal.PlainDate.from(date).add({ days: n }).toString();
export const shiftMonth = (date: string, n: number) =>
  Temporal.PlainDate.from(date).add({ months: n }).toString();
export const today = (zone = 'Asia/Shanghai') => Temporal.Now.plainDateISO(zone).toString();
export const dateAt = (instant: string, zone: string) =>
  Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDate().toString();
export const timeAt = (instant: string, zone: string) =>
  Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainTime().toString({
    smallestUnit: 'minute',
  });
export const addMinutes = (instant: string, n: number) =>
  Temporal.Instant.from(instant).add({ minutes: n }).toString();
export function resolveLocal(date: string, time: string, zone: string) {
  let local = Temporal.PlainDateTime.from(date + 'T' + time);
  for (let i = 0; i < 1440; i++) {
    if (local.toPlainDate().toString() !== date) throw RangeError('这个日期在所选时区不存在');
    const zoned = local.toZonedDateTime(zone, { disambiguation: 'earlier' });
    if (zoned.toPlainDateTime().equals(local)) return zoned.toInstant().toString();
    local = local.add({ minutes: 1 });
  }
  throw RangeError('这个日期在所选时区不存在');
}
export function dayEvents(events: Event[], date: string, zone: string) {
  const start = Date.parse(resolveLocal(date, '00:00', zone)),
    end = Date.parse(resolveLocal(addDays(date, 1), '00:00', zone));
  return events.filter((e) =>
    !e.deletedAt &&
    (e.startAt && e.endAt
      ? Date.parse(e.startAt) < end && Date.parse(e.endAt) > start
      : e.plannedDate === date)
  );
}
export function validPlace(p: Place) {
  return !!p && typeof p.label === 'string' && !!p.label.trim() && p.label.length <= 500 &&
    Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180;
}
export function validateEvent(e: Event) {
  if (!e.title.trim() || e.title.length > 200 || e.notes.length > 20000) {
    throw Error('请填写不超过200字的事项名称');
  }
  Temporal.PlainDate.from(e.plannedDate);
  if (!Number.isInteger(e.durationMinutes) || e.durationMinutes < 1 || e.durationMinutes > 10080) {
    throw Error('时长应为1至10080分钟');
  }
  if (
    !!e.startAt !== !!e.endAt ||
    e.startAt && e.endAt &&
      (Date.parse(e.endAt) - Date.parse(e.startAt) !== e.durationMinutes * 60000)
  ) throw Error('开始、结束与预计时长不一致');
  if (e.location && !validPlace(e.location)) throw Error('请确认具体地点');
  if (!['walking', 'cycling'].includes(e.travelMode)) throw Error('出行方式无效');
}
export function overlaps(events: Event[]) {
  const scheduled = events.filter((e) => e.startAt && e.endAt);
  return scheduled.flatMap((a, i) =>
    scheduled.slice(i + 1).filter((b) =>
      Date.parse(a.startAt!) < Date.parse(b.endAt!) && Date.parse(a.endAt!) > Date.parse(b.startAt!)
    ).map((b) => [a, b])
  );
}
