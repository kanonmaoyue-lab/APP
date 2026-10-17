import { createProvider, RouteError } from './provider.ts';
const assert = (v: unknown) => {
  if (!v) throw Error('assertion failed');
};
Deno.test('matrix uses lon-lat and seconds, preserving unreachable null', async () => {
  const provider = createProvider('private', async (url, init) => {
    assert(String(url).endsWith('/v2/matrix/foot-walking'));
    assert(JSON.parse(String(init?.body)).locations[0][0] === 120);
    return Response.json({ durations: [[0, null], [120, 0]] });
  });
  const result = await provider({
    action: 'matrix',
    mode: 'walking',
    places: [{ label: 'a', lat: 30, lon: 120 }, { label: 'b', lat: 31, lon: 121 }],
  });
  assert(JSON.stringify(result) === '{"durations":[[0,null],[120,0]]}');
});
Deno.test('ambiguous results remain separate and rate-limit retry is retained', async () => {
  const provider = createProvider(
    'private',
    async () =>
      Response.json({
        features: [{ properties: { label: '图书馆一' }, geometry: { coordinates: [120, 30] } }, {
          properties: { label: '图书馆二' },
          geometry: { coordinates: [121, 31] },
        }],
      }),
  );
  const result = await provider({ action: 'search', query: '图书馆' }) as { places: unknown[] };
  assert(result.places.length === 2);
  const limited = createProvider(
    'private',
    async () => new Response('', { status: 429, headers: { 'retry-after': '12' } }),
  );
  try {
    await limited({ action: 'search', query: '大学' });
    throw Error('expected failure');
  } catch (e) {
    assert(e instanceof RouteError && e.code === 'rateLimited' && e.retryAfter === 12);
  }
});
