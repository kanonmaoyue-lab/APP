import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
export function localConfig() {
  const result = spawnSync(resolve('node_modules/.bin/supabase'), ['status', '-o', 'json'], {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_HOME: resolve('../.cache/supabase') },
  });
  if (result.status !== 0) throw Error('Local backend unavailable');
  const v = JSON.parse(result.stdout), url = v.API_URL, key = v.PUBLISHABLE_KEY || v.ANON_KEY;
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) || !key || !v.SERVICE_ROLE_KEY) {
    throw Error('Test helper requires loopback backend');
  }
  return { url, key, service: v.SERVICE_ROLE_KEY };
}
export async function createUser() {
  const { url, key, service } = localConfig(),
    options = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
    admin = createClient(url, service, options),
    email = `test-${crypto.randomUUID()}@little-days.test`,
    password = `test-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw Error('Could not create local test user');
  const client = createClient(url, key, options);
  if ((await client.auth.signInWithPassword({ email, password })).error) {
    throw Error('Could not log into local test user');
  }
  return {
    client,
    admin,
    userId: data.user.id,
    email,
    password,
    url,
    key,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(data.user.id);
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url, key } = localConfig(),
    contents = `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\n`,
    file = '.env.test.local';
  if (existsSync(file) && readFileSync(file, 'utf8') !== contents) {
    throw Error('Existing public test configuration differs; refusing overwrite');
  }
  writeFileSync(file, contents, { mode: 0o600 });
  console.log('Local test bindings prepared; values not printed');
}
