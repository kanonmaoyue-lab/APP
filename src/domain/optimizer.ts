import type { Event, Mode, Place } from './types';
export type Matrices = Partial<Record<Mode, (number | null)[][]>>;
export interface RouteInput {
  origin: Place;
  startAt: string;
  endAt: string;
  events: Event[];
  busy: { startAt: string; endAt: string }[];
  matrices: Matrices;
}
export interface Stop {
  event: Event;
  startAt: string;
  endAt: string;
  travelSeconds: number;
  from: Place;
}
export type RouteResult =
  | { feasible: true; stops: Stop[]; travelSeconds: number; finishAt: string }
  | { feasible: false; reason: string };
export function optimize(input: RouteInput): RouteResult {
  const events = input.events,
    start = Date.parse(input.startAt),
    end = Date.parse(input.endAt),
    busy = input.busy.map((b) => ({ start: Date.parse(b.startAt), end: Date.parse(b.endAt) })).sort(
      (a, b) => a.start - b.start,
    );
  if (
    !Number.isFinite(start) || !Number.isFinite(end) || start >= end || !events.length ||
    events.length > 8 || new Set(events.map((e) => e.id)).size !== events.length ||
    events.some((e) =>
      !e.location || !Number.isInteger(e.durationMinutes) || e.durationMinutes < 1 ||
      e.locked && (!e.startAt || !e.endAt)
    ) || busy.some((b) => !Number.isFinite(b.start) || !Number.isFinite(b.end) || b.start >= b.end)
  ) return { feasible: false, reason: '请确认起止时间，并选择1至8个有具体地点的事项。' };
  let best: { stops: Stop[]; travel: number; finish: number } | null = null;
  function free(at: number, length: number) {
    for (const b of busy) {
      if (at + length <= b.start) break;
      if (at < b.end && at + length > b.start) at = b.end;
    }
    return at;
  }
  function visit(previous: number, at: number, remaining: number[], stops: Stop[], travel: number) {
    if (best && travel > best.travel) return;
    if (!remaining.length) {
      if (!best || travel < best.travel || travel === best.travel && at < best.finish) {
        best = { stops, travel, finish: at };
      }
      return;
    }
    for (const index of remaining) {
      const e = events[index], seconds = input.matrices[e.travelMode]?.[previous]?.[index + 1];
      if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds < 0) {
        continue;
      }
      const commute = Math.ceil(seconds * 1000), duration = e.durationMinutes * 60000;
      let arrive: number, finish: number;
      if (e.locked) {
        arrive = Date.parse(e.startAt!);
        finish = Date.parse(e.endAt!);
        if (
          !Number.isFinite(arrive) || !Number.isFinite(finish) || finish - arrive !== duration ||
          free(at, commute) + commute > arrive || busy.some((b) =>
            arrive < b.end && finish > b.start
          )
        ) continue;
      } else {
        const depart = free(at, commute + duration);
        arrive = depart + commute;
        finish = arrive + duration;
      }
      if (finish > end) continue;
      visit(index + 1, finish, remaining.filter((n) => n !== index), [...stops, {
        event: e,
        startAt: e.locked ? e.startAt! : new Date(arrive).toISOString(),
        endAt: e.locked ? e.endAt! : new Date(finish).toISOString(),
        travelSeconds: seconds,
        from: previous === 0 ? input.origin : events[previous - 1].location!,
      }], travel + seconds);
    }
  }
  visit(0, start, events.map((_, i) => i), [], 0);
  if (!best) {
    return {
      feasible: false,
      reason: '没有符合预约、占用时间和道路连通性的方案，请减少事项或放宽时间。',
    };
  }
  const result = best as { stops: Stop[]; travel: number; finish: number };
  return {
    feasible: true,
    stops: result.stops,
    travelSeconds: result.travel,
    finishAt: new Date(result.finish).toISOString(),
  };
}
