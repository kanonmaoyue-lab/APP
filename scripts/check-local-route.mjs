import { createUser } from './local.mjs';
const user = await createUser();
try {
  const endpoint = user.url + '/functions/v1/route-service';
  const origin = 'http://127.0.0.1:5173';
  const session = await user.client.auth.getSession();
  if (!session.data.session) throw Error('Local test login unavailable');
  const anonymous = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ action: 'invalid' }),
    signal: AbortSignal.timeout(15000),
  });
  const authenticated = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      apikey: user.key,
      authorization: 'Bearer ' + session.data.session.access_token,
    },
    body: JSON.stringify({ action: 'invalid' }),
    signal: AbortSignal.timeout(15000),
  });
  const a = await anonymous.json(), b = await authenticated.json();
  const result = {
    anonymous: { status: anonymous.status, code: a.code },
    authenticatedInvalid: { status: authenticated.status, code: b.code },
    // The local Kong gateway may return wildcard CORS for bearer-only requests.
    cors: [origin, '*'].includes(authenticated.headers.get('access-control-allow-origin')),
  };
  const rejected = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://untrusted.invalid' },
    body: JSON.stringify({ action: 'invalid' }),
    signal: AbortSignal.timeout(15000),
  });
  const rejectedBody = await rejected.json();
  result.rejectedOrigin = { status: rejected.status, code: rejectedBody.code };
  console.log(JSON.stringify(result));
  if (
    anonymous.status !== 401 || a.code !== 'authRequired' ||
    authenticated.status !== 400 || b.code !== 'invalid' || !result.cors ||
    rejected.status !== 403 || rejectedBody.code !== 'origin'
  ) {
    throw Error(
      'Local route auth boundary check failed; verify worker CORS and internal proxy configuration',
    );
  }
} finally {
  await user.cleanup();
}
