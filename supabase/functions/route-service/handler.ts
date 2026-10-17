import { type Place, RouteError, type RouteRequest, validCoordinates } from './provider.ts';
export interface Deps {
  origins: string[];
  configured: boolean;
  authenticate: (token: string) => Promise<string | null>;
  quota: (id: string) => Promise<boolean>;
  provider: (input: RouteRequest, signal?: AbortSignal) => Promise<unknown>;
}
export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin'),
      headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Vary': 'Origin',
        'Cache-Control': 'no-store',
      };
    if (origin && !deps.origins.includes(origin)) {
      return Response.json({ code: 'origin' }, { status: 403, headers });
    }
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    const send = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
      Response.json(body, { status, headers: { ...headers, ...extra } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return send({ code: 'method' }, 405);
    try {
      const token = req.headers.get('authorization') ?? '';
      if (!token.startsWith('Bearer ')) return send({ code: 'authRequired' }, 401);
      const user = await deps.authenticate(token);
      if (!user) return send({ code: 'authRequired' }, 401);
      const reader = req.body?.getReader();
      if (!reader) return send({ code: 'invalid' }, 400);
      let length = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 16384) {
          await reader.cancel();
          return send({ code: 'tooLarge' }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let pos = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, pos);
        pos += chunk.length;
      }
      let raw;
      try {
        raw = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return send({ code: 'invalid' }, 400);
      }
      if (
        !raw || typeof raw !== 'object' || !['search', 'matrix', 'directions'].includes(raw.action)
      ) return send({ code: 'invalid' }, 400);
      let input: RouteRequest;
      if (raw.action === 'search') {
        if (
          typeof raw.query !== 'string' || raw.query.trim().length < 2 || raw.query.length > 200
        ) return send({ code: 'invalid' }, 400);
        input = { action: 'search', query: raw.query.trim() };
      } else {
        if (
          !['walking', 'cycling'].includes(raw.mode) || !Array.isArray(raw.places) ||
          raw.places.length < 2 || raw.places.length > 9 || raw.places.some((p: Place) =>
            !p || typeof p.label !== 'string' || p.label.length > 500 ||
            !validCoordinates(p.lat, p.lon)
          )
        ) {
          return send({ code: 'invalid' }, 400);
        }
        input = {
          action: raw.action,
          mode: raw.mode,
          places: raw.places.map((p: Place) => ({ label: p.label, lat: p.lat, lon: p.lon })),
        };
      }
      if (!deps.configured) return send({ code: 'notConfigured' }, 503);
      if (!await deps.quota(user)) {
        return send({ code: 'rateLimited', retryAfter: 60 }, 429, { 'Retry-After': '60' });
      }
      return send(await deps.provider(input, req.signal));
    } catch (e) {
      if (e instanceof RouteError) {
        return send(
          { code: e.code, ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) },
          e.status,
          e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : {},
        );
      }
      return send({ code: 'unavailable' }, 503);
    }
  };
}
