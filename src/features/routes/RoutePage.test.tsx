import { expect, test } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { openRepository } from '../../data/repository';
import { newEvent, newProfile } from '../../domain/types';
import { today } from '../../domain/dates';
import { createRouteClient } from './client';
import RoutePage from './RoutePage';
import { adopt } from './proposal';
test('preview never writes; adoption and undo require explicit actions', async () => {
  const r = openRepository(crypto.randomUUID()),
    e = {
      ...newEvent(r.userId, today()),
      title: '图书馆',
      version: 1,
      location: { label: '测试目的地', lat: 30, lon: 120 },
    };
  await r.accept({ cursor: '1', operationId: crypto.randomUUID(), entities: [e] });
  const client = createRouteClient(async (input) =>
      input.action === 'search'
        ? { places: [{ label: '测试起点', lat: 31, lon: 121 }] }
        : { durations: [[0, 300], [300, 0]] }
    ),
    { unmount } = render(
      <RoutePage repository={r} profile={newProfile(r.userId)} client={client} />,
    );
  fireEvent.change(screen.getByLabelText('出发地点'), { target: { value: '校门' } });
  fireEvent.click(screen.getByRole('button', { name: '查找出发地点' }));
  fireEvent.click(
    within(await screen.findByRole('group', { name: '出发地点搜索结果' })).getByRole('button'),
  );
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '生成顺路建议' }));
  await screen.findByRole('region', { name: '动线预览' });
  expect(await r.pending()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '采用建议' }));
  await waitFor(async () => expect((await r.get('events', e.id))?.startAt).toBeTruthy());
  fireEvent.click(await screen.findByRole('button', { name: '撤销路线调整' }));
  await waitFor(async () => expect((await r.get('events', e.id))?.startAt).toBeNull());
  unmount();
  await r.clear();
  r.close();
});
test('stale source content prevents adoption even when version numbers match optimistic edits', async () => {
  const r = openRepository(crypto.randomUUID()),
    e = { ...newEvent(r.userId, today()), title: '原稿', version: 1 };
  await r.accept({
    cursor: '1',
    operationId: crypto.randomUUID(),
    entities: [{ ...e, title: '新稿' }],
  });
  await expect(
    adopt(r, {
      date: today(),
      cursor: '1',
      source: [e],
      result: { feasible: true, stops: [], travelSeconds: 0, finishAt: '2026-10-17T02:00:00Z' },
    }, newProfile(r.userId)),
  ).rejects.toThrow(/日程已更改/);
  await r.clear();
  r.close();
});
