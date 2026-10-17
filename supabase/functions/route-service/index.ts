import { createHandler } from './handler.ts';
import { createProvider } from './provider.ts';
const url = Deno.env.get('SUPABASE_URL') ?? '',
  anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  key = Deno.env.get('ORS_API_KEY') ?? '';
Deno.serve(createHandler({
  configured: !!key,
  origins: (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((v) => v.trim()).filter(Boolean),
  provider: createProvider(key),
  async authenticate(token) {
    const r = await fetch(url + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: token },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v.id === 'string' ? v.id : null;
  },
  async quota(userId) {
    const r = await fetch(url + '/rest/v1/rpc/consume_route_quota', {
      method: 'POST',
      headers: {
        apikey: service,
        Authorization: 'Bearer ' + service,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account_id: userId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw Error('Quota unavailable');
    return await r.json() === true;
  },
}));
