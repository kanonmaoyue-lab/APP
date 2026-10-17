export type Table =
  | 'profiles'
  | 'categories'
  | 'events'
  | 'recurrences'
  | 'overrides'
  | 'reviewItems'
  | 'reviewLogs';
export type Mode = 'walking' | 'cycling';
export type Rating = 'forgot' | 'fuzzy' | 'remembered';
export interface Meta {
  id: string;
  userId: string;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
}
export interface Place {
  label: string;
  lat: number;
  lon: number;
}
export interface Profile extends Meta {
  table: 'profiles';
  timeZone: string;
  dayStart: string;
  dayEnd: string;
  travelMode: Mode;
}
export interface Category extends Meta {
  table: 'categories';
  name: string;
  color: string;
}
export interface Event extends Meta {
  table: 'events';
  title: string;
  notes: string;
  plannedDate: string;
  startAt: string | null;
  endAt: string | null;
  durationMinutes: number;
  location: Place | null;
  categoryId: string | null;
  locked: boolean;
  completedAt: string | null;
  reviewItemId: string | null;
  recurrenceId: string | null;
  occurrenceDate: string | null;
  travelMode: Mode;
}
export interface Recurrence extends Meta {
  table: 'recurrences';
  template: Event;
  rule: 'daily' | 'weekdays' | 'weekly';
  startsOn: string;
  endsOn: string | null;
  startTime: string;
  timeZone: string;
  daysOfWeek: number[];
}
export interface Override extends Meta {
  table: 'overrides';
  recurrenceId: string;
  occurrenceDate: string;
  cancelled: boolean;
  patch: Partial<Event>;
}
export interface ReviewItem extends Meta {
  table: 'reviewItems';
  title: string;
  notes: string;
  learnedOn: string;
  level: 0 | 1 | 2 | 3 | 4;
  nextReviewOn: string;
  durationMinutes: number;
  categoryId: string | null;
  archivedAt: string | null;
}
export interface ReviewLog extends Meta {
  table: 'reviewLogs';
  itemId: string;
  reviewDate: string;
  rating: Rating;
  previousLevel: number;
  nextLevel: number;
}
export type Entity = Profile | Category | Event | Recurrence | Override | ReviewItem | ReviewLog;
export type Of<T extends Table> = Extract<Entity, { table: T }>;
export interface Change {
  table: Table;
  id: string;
  baseVersion: number;
  value: Entity | null;
}
export type Command = { kind: 'write'; changes: Change[]; expectedCursor?: string } | {
  kind: 'review';
  itemId: string;
  baseVersion: number;
  rating: Rating;
  reviewDate: string;
};
export interface Operation {
  id: string;
  userId: string;
  command: Command;
}
export interface Batch {
  cursor: string;
  operationId: string;
  entities: Entity[];
}
export type ApplyResult = { status: 'applied'; batch: Batch } | {
  status: 'conflict';
  entities: Entity[];
  reason: string;
};
export interface SyncPage {
  batches: Batch[];
  cursor: string;
  hasMore: boolean;
}
export const tables: Table[] = [
  'profiles',
  'categories',
  'events',
  'recurrences',
  'overrides',
  'reviewItems',
  'reviewLogs',
];
export const meta = (userId: string): Meta => ({
  id: crypto.randomUUID(),
  userId,
  version: 0,
  updatedAt: new Date().toISOString(),
  deletedAt: null,
});
export const newProfile = (userId: string): Profile => ({
  ...meta(userId),
  id: userId,
  table: 'profiles',
  timeZone: 'Asia/Shanghai',
  dayStart: '07:00',
  dayEnd: '23:00',
  travelMode: 'walking',
});
export const newEvent = (userId: string, date: string, mode: Mode = 'walking'): Event => ({
  ...meta(userId),
  table: 'events',
  title: '',
  notes: '',
  plannedDate: date,
  startAt: null,
  endAt: null,
  durationMinutes: 30,
  location: null,
  categoryId: null,
  locked: false,
  completedAt: null,
  reviewItemId: null,
  recurrenceId: null,
  occurrenceDate: null,
  travelMode: mode,
});
export const change = (value: Entity): Change => ({
  table: value.table,
  id: value.id,
  baseVersion: value.version,
  value,
});
export const write = (userId: string, changes: Change[], expectedCursor?: string): Operation => ({
  id: crypto.randomUUID(),
  userId,
  command: { kind: 'write', changes, ...(expectedCursor !== undefined ? { expectedCursor } : {}) },
});
export const keys = (op: Operation) =>
  op.command.kind === 'review'
    ? ['reviewItems:' + op.command.itemId]
    : op.command.changes.map((c) => c.table + ':' + c.id);
