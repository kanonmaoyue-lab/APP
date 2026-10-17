import { spawnSync } from 'node:child_process';
import { localConfig } from './local.mjs';
const { url, key } = localConfig();
const result = spawnSync('node_modules/.bin/vite', ['build', '--outDir', '.production-test-dist'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key },
});
process.exit(result.status ?? 1);
