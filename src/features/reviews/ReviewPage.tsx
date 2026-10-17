import { useState } from 'react';
import { Dialog, Empty, Heading } from '../../app/components';
import { useRecords } from '../../data/useRecords';
import type { Repository } from '../../data/repository';
import {
  type Category,
  change,
  meta,
  newEvent,
  type Profile,
  type Rating,
  type ReviewItem,
  write,
} from '../../domain/types';
import { addDays, today } from '../../domain/dates';
export default function ReviewPage(
  { repository: r, profile, currentDate = today(profile.timeZone) }: {
    repository: Repository;
    profile: Profile;
    currentDate?: string;
  },
) {
  const data = useRecords(r),
    [filter, setFilter] = useState<'due' | 'all' | 'archive'>('due'),
    [editing, setEditing] = useState<{ item: ReviewItem; existing: boolean } | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const items = data.reviewItems.filter((i) =>
    filter === 'archive'
      ? !!i.archivedAt
      : !i.archivedAt && (filter === 'all' || i.nextReviewOn <= currentDate)
  ).sort((a, b) => a.nextReviewOn.localeCompare(b.nextReviewOn));
  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  async function schedule(item: ReviewItem) {
    const existing = (await r.list('events')).find((e) =>
      e.reviewItemId === item.id && e.plannedDate === currentDate
    );
    if (existing) {
      setNotice('已在今天的日程中，去「今天」设置时间即可。');
      return;
    }
    await r.enqueue(
      write(r.userId, [
        change({
          ...newEvent(r.userId, currentDate, profile.travelMode),
          title: '复习 · ' + item.title,
          notes: item.notes,
          durationMinutes: item.durationMinutes,
          categoryId: item.categoryId,
          reviewItemId: item.id,
        }),
      ]),
    );
    setNotice('已放入今天的待安排区；复习后再按实际记忆情况评分。');
  }
  async function grade(item: ReviewItem, rating: Rating) {
    await r.enqueue({
      id: crypto.randomUUID(),
      userId: r.userId,
      command: {
        kind: 'review',
        itemId: item.id,
        baseVersion: item.version,
        rating,
        reviewDate: currentDate,
      },
    });
    setNotice('已记录本次复习；下次日期从今天重新计算。');
  }
  return (
    <>
      <Heading
        eyebrow='GROW A LITTLE, EVERY DAY'
        title='记忆，也会慢慢开花。'
        description='按1、3、7、14、30天间隔，给知识浇一点水。'
        flower='❀'
      />
      <div className='toolbar'>
        <div className='segmented'>
          {(['due', 'all', 'archive'] as const).map((value, i) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {['待复习', '全部主题', '已归档'][i]}
            </button>
          ))}
        </div>
        <button
          className='primary'
          onClick={() =>
            setEditing({
              existing: false,
              item: {
                ...meta(r.userId),
                table: 'reviewItems',
                title: '',
                notes: '',
                learnedOn: currentDate,
                nextReviewOn: addDays(currentDate, 1),
                level: 0,
                durationMinutes: 20,
                categoryId: null,
                archivedAt: null,
              },
            })}
        >
          记录学习内容
        </button>
      </div>
      {data.error && <p role='alert' className='error'>{data.error}</p>}
      {error && <p role='alert' className='error'>{error}</p>}
      {notice && <p role='status' className='notice'>{notice}</p>}
      <div className='review-grid'>
        {items.map((item) => {
          const logs = data.reviewLogs.filter((l) => l.itemId === item.id).sort((a, b) =>
              b.reviewDate.localeCompare(a.reviewDate)
            ),
            graded = logs.some((l) => l.reviewDate >= currentDate),
            scheduled = data.events.some((e) =>
              e.reviewItemId === item.id && e.plannedDate === currentDate
            ),
            mismatch = data.events.some((e) =>
              e.reviewItemId === item.id && e.plannedDate > currentDate &&
              e.plannedDate !== item.nextReviewOn
            );
          return (
            <article className='panel' key={item.id}>
              <div className='row between'>
                <span className='tag'>
                  {item.nextReviewOn < currentDate ? '逾期 · ' : ''}
                  {item.nextReviewOn} · 第 {item.level + 1} 阶段
                </span>
                <button className='text' onClick={() => setEditing({ item, existing: true })}>
                  编辑
                </button>
              </div>
              <h2 className='review-title'>{item.title}</h2>
              <p className='note-text'>{item.notes || '还没有笔记，可以随时补充。'}</p>
              <p className='caption'>预计 {item.durationMinutes} 分钟</p>
              {mismatch && (
                <p className='notice pink'>未来日程与新的复习日期不同，请在日历中自行调整。</p>
              )}
              {!item.archivedAt && (
                <>
                  <button disabled={busy || graded} onClick={() => void run(() => schedule(item))}>
                    {scheduled ? '已在今日日程' : '放入今日日程'}
                  </button>
                  <div className='row review-ratings'>
                    {(['forgot', 'fuzzy', 'remembered'] as const).map((rating, i) => (
                      <button
                        key={rating}
                        disabled={busy || graded || currentDate < item.learnedOn}
                        onClick={() => void run(() => grade(item, rating))}
                      >
                        {['忘记了', '有点模糊', '记住了'][i]}
                      </button>
                    ))}
                  </div>
                  {graded && <p className='caption'>今天已评分，给记忆一点休息时间。</p>}
                </>
              )}
              <details>
                <summary>复习记录（{logs.length}）</summary>
                {logs.map((l) => (
                  <p key={l.id} className='caption'>
                    {l.reviewDate} ·{' '}
                    {{ forgot: '忘记了', fuzzy: '有点模糊', remembered: '记住了' }[l.rating]} ·{' '}
                    {l.previousLevel + 1} → {l.nextLevel + 1} 阶段
                  </p>
                ))}
              </details>
              <button
                className='text'
                onClick={() =>
                  void run(() =>
                    r.enqueue(
                      write(r.userId, [
                        change({
                          ...item,
                          archivedAt: item.archivedAt ? null : new Date().toISOString(),
                        }),
                      ]),
                    )
                  )}
              >
                {item.archivedAt ? '恢复主题' : '归档主题'}
              </button>
            </article>
          );
        })}
      </div>
      {!items.length && (
        <section className='panel'>
          <Empty
            title={filter === 'due' ? '今日的小花，都浇过水啦' : '留下一点新知识'}
            text='记录学习主题和笔记，到期后会在这里相遇。'
          />
        </section>
      )}
      {editing && (
        <ReviewEditor
          item={editing.item}
          existing={editing.existing}
          currentDate={currentDate}
          categories={data.categories}
          onClose={() => setEditing(null)}
          onSave={async (item) => {
            await r.enqueue(write(r.userId, [change(item)]));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
function ReviewEditor(
  { item, existing, currentDate, categories, onClose, onSave }: {
    item: ReviewItem;
    existing: boolean;
    currentDate: string;
    categories: Category[];
    onClose: () => void;
    onSave: (item: ReviewItem) => Promise<void>;
  },
) {
  const [draft, setDraft] = useState(item),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Dialog
      title='留住今天学到的'
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            if (!draft.title.trim()) throw Error('请填写主题');
            await onSave({ ...draft, title: draft.title.trim() });
          } catch (e) {
            setError(e instanceof Error ? e.message : '保存失败');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className='stack'>
          <label>
            主题<input
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            笔记<textarea
              maxLength={20000}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <div className='form-grid'>
            <label>
              学习日期<input
                type='date'
                required
                disabled={existing}
                max={currentDate}
                value={draft.learnedOn}
                onChange={(e) => {
                  const date = e.target.value;
                  if (date) {
                    setDraft({
                      ...draft,
                      learnedOn: date,
                      nextReviewOn: addDays(date, 1),
                    });
                  }
                }}
              />
            </label>
            <label>
              预计复习时长<input
                type='number'
                min={1}
                max={10080}
                required
                value={draft.durationMinutes}
                onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })}
              />
            </label>
            <label>
              分类<select
                value={draft.categoryId ?? ''}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}
              >
                <option value=''>未分类</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        {error && <p role='alert' className='error'>{error}</p>}
        <div className='actions'>
          <button type='button' disabled={busy} onClick={onClose}>取消</button>
          <button className='primary' disabled={busy}>保存主题</button>
        </div>
      </form>
    </Dialog>
  );
}
