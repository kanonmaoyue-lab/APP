import type { Repository } from '../../data/repository';
import type { Change, Event, Profile } from '../../domain/types';
import { dayEvents } from '../../domain/dates';
import { expand } from '../../domain/recurrence';
import type { RouteResult } from '../../domain/optimizer';
import { content, eventChanges, undoable } from '../calendar/commands';
export interface Proposal {
  result: Extract<RouteResult, { feasible: true }>;
  source: Event[];
  date: string;
  cursor: string;
}
export async function schedule(r: Repository, date: string, profile: Profile) {
  const [events, series, overrides] = await Promise.all([
    r.list('events'),
    r.list('recurrences', true),
    r.list('overrides'),
  ]);
  return dayEvents(
    [
      ...events,
      ...series.flatMap((s) => expand(s, overrides, { start: date, end: date })),
    ],
    date,
    profile.timeZone,
  );
}
export const snapshot = (events: Event[]) =>
  events.map((e) => e.version + ':' + content(e)).sort().join('\n');
export async function adopt(r: Repository, p: Proposal, profile: Profile) {
  if ((await r.pending()).length || (await r.conflicts()).length) {
    throw Error('请先同步并处理冲突，再重新生成建议。');
  }
  const current = await schedule(r, p.date, profile);
  if (snapshot(current) !== snapshot(p.source)) throw Error('日程已更改，请重新生成建议。');
  const changes: Change[] = [];
  for (const stop of p.result.stops) {
    const next = { ...stop.event, startAt: stop.startAt, endAt: stop.endAt, plannedDate: p.date },
      original = p.source.find((e) => e.id === next.id);
    if (content(original) === content(next)) continue;
    changes.push(
      ...await eventChanges(r, next, { profile, scope: 'only', rule: 'none', endsOn: null }),
    );
  }
  if (!changes.length) throw Error('当前时间已经符合建议，无需改动。');
  return undoable(r, changes, p.cursor);
}
export function navigationUrl(place: { lat: number; lon: number }, mode: 'walking' | 'cycling') {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', `${place.lat},${place.lon}`);
  url.searchParams.set('travelmode', mode === 'walking' ? 'walking' : 'bicycling');
  return url.toString();
}
