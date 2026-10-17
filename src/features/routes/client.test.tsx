import { expect, test } from 'vitest';
import { createRouteClient } from './client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlaceSearch } from './PlaceSearch';
import type { Place } from '../../domain/types';
test('ambiguous places remain separate and unreachable matrix values are not zero', async () => {
  const places = [{ label: '图书馆一', lat: 30, lon: 120 }, {
      label: '图书馆二',
      lat: 31,
      lon: 121,
    }],
    c = createRouteClient(async (input) =>
      input.action === 'search' ? { places } : { durations: [[0, null], [120, 0]] }
    );
  expect(await c.search('图书馆', new AbortController().signal)).toEqual(places);
  expect((await c.matrices(places, ['walking'], new AbortController().signal)).walking?.[0][1])
    .toBeNull();
});
test('a cancelled older search cannot replace newer results or select a place automatically', async () => {
  let older: (value: Place[]) => void = () => {}, chosen: Place | null = null;
  const client = {
    search: async (query: string) =>
      query === '旧地点'
        ? new Promise<Place[]>((r) => older = r)
        : [{ label: '新地点结果', lat: 31, lon: 121 }],
    matrices: async () => ({}),
  };
  render(<PlaceSearch label='目的地' value={null} onChange={(p) => chosen = p} client={client} />);
  fireEvent.change(screen.getByLabelText('目的地'), { target: { value: '旧地点' } });
  fireEvent.click(screen.getByRole('button', { name: '查找目的地' }));
  fireEvent.change(screen.getByLabelText('目的地'), { target: { value: '新地点' } });
  fireEvent.click(screen.getByRole('button', { name: '查找目的地' }));
  await screen.findByText('新地点结果');
  await act(async () => older([{ label: '旧地点结果', lat: 30, lon: 120 }]));
  await waitFor(() => expect(screen.queryByText('旧地点结果')).toBeNull());
  expect(chosen).toBeNull();
});
