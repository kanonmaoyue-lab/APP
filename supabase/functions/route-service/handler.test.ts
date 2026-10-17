import { createHandler } from './handler.ts';
const assert = (v: unknown) => {
  if (!v) throw Error('assertion failed');
};
Deno.test('unauthenticated, invalid and untrusted-origin calls cannot spend quota', async () => {
  let quota = 0, provider = 0;
  const handler = createHandler({
    origins: ['https://app.test'],
    configured: true,
    authenticate: async (token) => token === 'Bearer valid' ? 'user' : null,
    quota: async () => {
      quota++;
      return true;
    },
    provider: async () => {
      provider++;
      return { places: [] };
    },
  });
  const req = (body: unknown, token = 'Bearer valid', origin = 'https://app.test') =>
    new Request('https://edge.test', {
      method: 'POST',
      headers: { origin, authorization: token },
      body: JSON.stringify(body),
    });
  assert((await handler(req({ action: 'search', query: '校门' }, ''))).status === 401);
  assert(
    (await handler(
      req({
        action: 'matrix',
        mode: 'walking',
        places: [{ label: 'x', lat: 999, lon: 120 }, { label: 'y', lat: 30, lon: 120 }],
      }),
    )).status === 400,
  );
  assert(
    (await handler(req({ action: 'search', query: '校门' }, 'Bearer valid', 'https://evil.test')))
      .status === 403,
  );
  assert(quota === 0 && provider === 0);
  assert((await handler(req({ action: 'search', query: '校门' }))).status === 200);
  assert(quota === 1 && provider === 1);
});
Deno.test('shared quota rejection exposes retry but no provider response or secrets', async () => {
  let calls = 0;
  const h = createHandler({
    origins: ['https://app.test'],
    configured: true,
    authenticate: async () => 'user',
    quota: async () => false,
    provider: async () => {
      calls++;
      throw Error('private-key');
    },
  });
  const r = await h(
    new Request('https://edge.test', {
      method: 'POST',
      headers: { origin: 'https://app.test', authorization: 'Bearer valid' },
      body: JSON.stringify({ action: 'search', query: '大学' }),
    }),
  );
  assert(r.status === 429);
  assert((await r.json()).retryAfter === 60);
  assert(calls === 0);
});
