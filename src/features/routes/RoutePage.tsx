import { useEffect, useMemo, useRef, useState } from 'react';
import type { Repository } from '../../data/repository';
import { useRecords } from '../../data/useRecords';
import type { Mode, Place, Profile } from '../../domain/types';
import { dayEvents, resolveLocal, timeAt, today } from '../../domain/dates';
import { expand } from '../../domain/recurrence';
import { optimize } from '../../domain/optimizer';
import { Heading } from '../../app/components';
import { PlaceSearch } from './PlaceSearch';
import type { RouteClient } from './client';
import { adopt, navigationUrl, type Proposal, schedule } from './proposal';
export default function RoutePage(
  { repository: r, profile, client }: {
    repository: Repository;
    profile: Profile;
    client: RouteClient;
  },
) {
  const data = useRecords(r),
    [date, setDate] = useState(() => today(profile.timeZone)),
    [start, setStart] = useState('08:00'),
    [end, setEnd] = useState('20:00'),
    [origin, setOrigin] = useState<Place | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [modes, setModes] = useState<Record<string, Mode>>({}),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [undo, setUndo] = useState<(() => Promise<void>) | null>(null),
    request = useRef<AbortController | null>(null);
  const events = useMemo(
      () =>
        dayEvents(
          [
            ...data.events,
            ...data.recurrences.flatMap((s) =>
              expand(s, data.overrides, { start: date, end: date })
            ),
          ],
          date,
          profile.timeZone,
        ),
      [data, date, profile.timeZone],
    ),
    choices = events.filter((e) => !e.completedAt),
    chosen = choices.filter((e) => selected.includes(e.id));
  useEffect(() => () => request.current?.abort(), []);
  function invalidate() {
    request.current?.abort();
    setProposal(null);
    setBusy(false);
  }
  async function preview() {
    setProposal(null);
    setError('');
    if (!origin) {
      setError('请先查找并确认出发地点。');
      return;
    }
    if (!chosen.length || chosen.length > 8) {
      setError('请选择1至8个事项。');
      return;
    }
    if (chosen.some((e) => !e.location)) {
      setError('请先在日历编辑事项，查找并确认每个目的地。');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      if ((await r.pending()).length || (await r.conflicts()).length) {
        throw Error('请先等待同步完成并处理冲突，再生成建议。');
      }
      const source = await schedule(r, date, profile),
        cursor = await r.cursor(),
        items = chosen.map((e) => ({ ...e, travelMode: modes[e.id] ?? e.travelMode })),
        matrices = await client.matrices(
          [origin, ...items.map((e) => e.location!)],
          items.map((e) => e.travelMode),
          controller.signal,
        );
      controller.signal.throwIfAborted();
      const result = optimize({
        origin,
        startAt: resolveLocal(date, start, profile.timeZone),
        endAt: resolveLocal(date, end, profile.timeZone),
        events: items,
        busy: source.filter((e) => !selected.includes(e.id) && e.startAt && e.endAt).map((e) => ({
          startAt: e.startAt!,
          endAt: e.endAt!,
        })),
        matrices,
      });
      if (!result.feasible) throw Error(result.reason);
      setProposal({ result, source, date, cursor });
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '无法生成路线');
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow='A LITTLE LESS RUSH'
        title='把路，走得顺一点。'
        description='浙江工业大学（莫干山校区） · 先确认地点，再安排顺序。'
        flower='⌁'
      />
      <p className='notice'>
        步行与骑行时间来自道路服务。校门开放、天气与校内骑行规定，请以现场情况为准。导航会打开外部地图。
      </p>
      <div className='stack'>
        <section className='panel'>
          <div className='form-grid'>
            <label>
              出行日期<input
                type='date'
                required
                value={date}
                onChange={(e) => {
                  if (e.target.value) {
                    invalidate();
                    setSelected([]);
                    setDate(e.target.value);
                  }
                }}
              />
            </label>
            <div />
            <label>
              最早出发<input
                type='time'
                value={start}
                onChange={(e) => {
                  invalidate();
                  setStart(e.target.value);
                }}
              />
            </label>
            <label>
              最晚完成<input
                type='time'
                value={end}
                onChange={(e) => {
                  invalidate();
                  setEnd(e.target.value);
                }}
              />
            </label>
          </div>
          <PlaceSearch
            label='出发地点'
            value={origin}
            onChange={(place) => {
              invalidate();
              setOrigin(place);
            }}
            client={client}
          />
        </section>
        <section className='panel'>
          <h2>今天，想顺路做的事</h2>
          <p className='caption'>最多8个目的地；固定预约保留时间，未选中的已排事项作为占用时间。</p>
          <div className='stack'>
            {choices.map((e) => (
              <div className='row between' key={e.id}>
                <label className='checkbox'>
                  <input
                    type='checkbox'
                    checked={selected.includes(e.id)}
                    onChange={(event) => {
                      invalidate();
                      setSelected(
                        event.target.checked
                          ? [...selected, e.id]
                          : selected.filter((id) => id !== e.id),
                      );
                    }}
                  />
                  {e.title}
                  {e.locked ? ' · 固定预约' : ''}
                  <small>{e.location?.label ?? '请先在日历设置地点'}</small>
                </label>
                <select
                  aria-label={e.title + '出行方式'}
                  className='mode-select'
                  value={modes[e.id] ?? e.travelMode}
                  onChange={(event) => {
                    invalidate();
                    setModes({ ...modes, [e.id]: event.target.value as Mode });
                  }}
                >
                  <option value='walking'>步行</option>
                  <option value='cycling'>骑行</option>
                </select>
              </div>
            ))}
          </div>
          {!choices.length && <p className='muted'>先在日历记下今天要做的事吧。</p>}
          <button className='primary route-generate' disabled={busy} onClick={() => void preview()}>
            {busy ? '正在查询道路时间…' : '生成顺路建议'}
          </button>
        </section>
        {error && <p role='alert' className='error'>{error}</p>}
        {proposal && (
          <section className='panel' aria-label='动线预览'>
            <h2>顺路建议 · 还未改动日程</h2>
            <p>
              预计通勤 {Math.ceil(proposal.result.travelSeconds / 60)}{' '}
              分钟，{timeAt(proposal.result.finishAt, profile.timeZone)} 完成。
            </p>
            <ol className='route-stops'>
              {proposal.result.stops.map((stop) => (
                <li key={stop.event.id}>
                  <h3>
                    {stop.event.title} {stop.event.locked && <span className='tag'>固定预约</span>}
                  </h3>
                  <p className='caption'>
                    原安排{' '}
                    {stop.event.startAt ? timeAt(stop.event.startAt, profile.timeZone) : '待安排'}
                    {' '}
                    → 建议 {timeAt(stop.startAt, profile.timeZone)} —{' '}
                    {timeAt(stop.endAt, profile.timeZone)} ·{' '}
                    {stop.event.travelMode === 'walking' ? '步行' : '骑行'}约{' '}
                    {Math.ceil(stop.travelSeconds / 60)} 分钟
                  </p>
                  <p>
                    {stop.event.location!.label} ·{' '}
                    <a
                      href={navigationUrl(stop.event.location!, stop.event.travelMode)}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      地图导航 ↗
                    </a>
                  </p>
                </li>
              ))}
            </ol>
            <button
              className='primary'
              onClick={async () => {
                try {
                  const revert = await adopt(r, proposal, profile);
                  setUndo(() => revert);
                  setProposal(null);
                  setError('');
                } catch (e) {
                  setError(e instanceof Error ? e.message : '采用失败');
                }
              }}
            >
              采用建议
            </button>
          </section>
        )}
        {undo && (
          <div className='toast' role='status'>
            已采用顺路建议{' '}
            <button
              onClick={async () => {
                try {
                  await undo();
                  setUndo(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : '撤销失败');
                }
              }}
            >
              撤销路线调整
            </button>
          </div>
        )}
      </div>
    </>
  );
}
