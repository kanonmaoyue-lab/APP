import { useMemo, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useRecords } from '../../data/useRecords';
import type { Repository } from '../../data/repository';
import { type Event, newEvent, type Profile } from '../../domain/types';
import {
  addDays,
  addMinutes,
  dateAt,
  dayEvents,
  overlaps,
  resolveLocal,
  timeAt,
} from '../../domain/dates';
import { expand } from '../../domain/recurrence';
import { Empty, Heading } from '../../app/components';
import EventEditor, { type PlaceField } from './EventEditor';
import Timeline, { EventCard } from './Timeline';
import { deleteEvent, eventChanges, type SaveOptions, undoable } from './commands';
export default function CalendarPage(
  { repository, profile, date, onDate, initialView = 'day', placeField }: {
    repository: Repository;
    profile: Profile;
    date: string;
    onDate: (date: string) => void;
    initialView?: 'day' | 'week' | 'month';
    placeField?: PlaceField;
  },
) {
  const data = useRecords(repository),
    [view, setView] = useState(initialView),
    [editing, setEditing] = useState<Event | null>(null),
    [error, setError] = useState(''),
    [undo, setUndo] = useState<(() => Promise<void>) | null>(null),
    [saved, setSaved] = useState(false),
    selected = Temporal.PlainDate.from(date);
  const range = useMemo(
    () => ({
      start: selected.with({ day: 1 }).subtract({ days: 7 }).toString(),
      end: selected.with({ day: 1 }).add({ months: 1, days: 7 }).toString(),
    }),
    [date],
  );
  const all = useMemo(
      () => [...data.events, ...data.recurrences.flatMap((s) => expand(s, data.overrides, range))],
      [data, range],
    ),
    events = dayEvents(all, date, profile.timeZone),
    conflicts = overlaps(events),
    weekStart = selected.subtract({ days: selected.dayOfWeek - 1 }).toString();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  async function save(event: Event, options: SaveOptions) {
    const changes = await eventChanges(repository, event, options);
    if (changes.some((c) => c.value === null)) {
      await repository.enqueue({
        id: crypto.randomUUID(),
        userId: repository.userId,
        command: { kind: 'write', changes },
      });
      setUndo(null);
    } else {
      const revert = await undoable(repository, changes);
      setUndo(() => revert);
    }
    setEditing(null);
    setSaved(true);
    setError('');
  }
  async function drag(e: DragEndEvent) {
    if (!e.over) return;
    const event = e.active.data.current?.event as Event | undefined;
    if (!event) return;
    try {
      let startAt: string;
      if (event.startAt) {
        const clock = timeAt(event.startAt, profile.timeZone),
          minute = Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3)),
          snapped = Math.round((minute + e.delta.y) / 15) * 15,
          day = addDays(dateAt(event.startAt, profile.timeZone), Math.floor(snapped / 1440)),
          m = (snapped % 1440 + 1440) % 1440;
        startAt = resolveLocal(
          day,
          `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
          profile.timeZone,
        );
      } else {
        const y = (e.active.rect.current.translated?.top ?? e.over.rect.top) - e.over.rect.top,
          m = Math.max(0, Math.min(1425, Math.round(y / 15) * 15));
        startAt = resolveLocal(
          date,
          `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
          profile.timeZone,
        );
      }
      await save({
        ...event,
        startAt,
        endAt: addMinutes(startAt, event.durationMinutes),
        plannedDate: dateAt(startAt, profile.timeZone),
      }, { profile, scope: 'only', rule: 'none', endsOn: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : '调整失败');
    }
  }
  const first = selected.with({ day: 1 }),
    monthStart = first.subtract({ days: first.dayOfWeek - 1 });
  return (
    <>
      <Heading
        eyebrow='A LITTLE PLAN, A LOVELY DAY'
        title={initialView === 'day' ? '给今天，留一点喜欢。' : '日子有序，也有留白。'}
        description='慢慢安排，按自己的节奏来。'
      />
      <div className='toolbar'>
        <h2>
          {selected.month}月{selected.day}日{' '}
          <small>星期{'一二三四五六日'[selected.dayOfWeek - 1]}</small>
        </h2>
        <button
          aria-label='上一个日期'
          onClick={() =>
            onDate(
              selected.subtract(
                view === 'month' ? { months: 1 } : { days: view === 'week' ? 7 : 1 },
              ).toString(),
            )}
        >
          ‹
        </button>
        <input
          type='date'
          aria-label='选择日期'
          value={date}
          onChange={(e) => {
            if (e.target.value) onDate(e.target.value);
          }}
        />
        <button
          aria-label='下一个日期'
          onClick={() =>
            onDate(
              selected.add(view === 'month' ? { months: 1 } : { days: view === 'week' ? 7 : 1 })
                .toString(),
            )}
        >
          ›
        </button>
        <div className='segmented'>
          {(['day', 'week', 'month'] as const).map((v, i) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {['日', '周', '月'][i]}
            </button>
          ))}
        </div>
        <button
          className='primary'
          onClick={() => setEditing(newEvent(repository.userId, date, profile.travelMode))}
        >
          新增事项
        </button>
      </div>
      {data.error && <p role='alert' className='error'>{data.error}</p>}
      {error && <p role='alert' className='error'>{error}</p>}
      {conflicts.length > 0 && (
        <p className='notice pink'>有 {conflicts.length} 处时间重叠，按实际安排调整即可。</p>
      )}
      <DndContext sensors={sensors} onDragEnd={(e) => void drag(e)}>
        <div className='calendar-layout'>
          <section className='panel calendar-panel'>
            {view === 'day'
              ? (
                <Timeline
                  date={date}
                  profile={profile}
                  events={events}
                  categories={data.categories}
                  onEdit={setEditing}
                />
              )
              : view === 'week'
              ? (
                <div className='week-grid'>
                  {Array.from({ length: 7 }, (_, i) => {
                    const day = addDays(weekStart, i);
                    return (
                      <section key={day}>
                        <button
                          className='text'
                          onClick={() => {
                            onDate(day);
                            setView('day');
                          }}
                        >
                          {day.slice(5)}
                        </button>
                        <div className='stack'>
                          {dayEvents(all, day, profile.timeZone).map((e) => (
                            <EventCard
                              key={e.id}
                              event={e}
                              zone={profile.timeZone}
                              onEdit={setEditing}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )
              : (
                <div className='month-grid'>
                  {'一二三四五六日'.split('').map((d) => (
                    <span className='weekday' key={d}>{d}</span>
                  ))}
                  {Array.from({ length: 42 }, (_, i) => {
                    const d = monthStart.add({ days: i }),
                      day = d.toString(),
                      items = dayEvents(all, day, profile.timeZone);
                    return (
                      <button
                        key={day}
                        aria-label={day}
                        className={'month-day' + (d.month !== selected.month ? ' other' : '') +
                          (day === date ? ' selected' : '')}
                        onClick={() => {
                          onDate(day);
                          setView('day');
                        }}
                      >
                        <b>{d.day}</b>
                        {items.slice(0, 3).map((e) => (
                          <small key={e.id}>{e.completedAt ? '✓ ' : ''}{e.title}</small>
                        ))}
                        {items.length > 3 && <small>还有 {items.length - 3} 项</small>}
                      </button>
                    );
                  })}
                </div>
              )}
          </section>
          <aside className='stack'>
            <section className='panel'>
              <div className='row between'>
                <h3>待安排</h3>
                <span className='tag'>{events.filter((e) => !e.startAt).length} 件小事</span>
              </div>
              <p className='caption'>拖入时间轴，或点击设置时间。</p>
              <div className='stack'>
                {events.filter((e) => !e.startAt).map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    zone={profile.timeZone}
                    onEdit={setEditing}
                    category={data.categories.find((c) => c.id === e.categoryId)}
                  />
                ))}
              </div>
              {!events.some((e) => !e.startAt) && (
                <Empty title='留一点空白' text='想做的事，随时记下来。' />
              )}
            </section>
            <p className='notice'>
              小提示 ☁<br />长按小把手拖动；点击卡片精确修改。<br />固定预约会在顺路建议中保留时间。
            </p>
          </aside>
        </div>
      </DndContext>
      {editing && (
        <EventEditor
          event={editing}
          profile={profile}
          categories={data.categories}
          series={data.recurrences.find((s) => s.id === editing.recurrenceId)}
          placeField={placeField}
          onSave={save}
          onCancel={() => setEditing(null)}
          onDelete={editing.title
            ? async (scope) => {
              await deleteEvent(repository, editing, scope);
              setEditing(null);
              setUndo(null);
              setSaved(false);
            }
            : undefined}
        />
      )} {saved && (
        <div className='toast' role='status'>
          已保存安排 {undo && (
            <button
              onClick={async () => {
                try {
                  await undo();
                  setUndo(null);
                  setSaved(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : '撤销失败');
                }
              }}
            >
              撤销
            </button>
          )}
          <button aria-label='关闭提示' onClick={() => setSaved(false)}>×</button>
        </div>
      )}
    </>
  );
}
