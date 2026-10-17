import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
const cache = resolve('../.cache/images'), bin = resolve('../.tools/bin');
mkdirSync(cache, { recursive: true });
mkdirSync(bin, { recursive: true });
const run = (c, a) => execFileSync(c, a, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
if (run('docker', ['info', '--format', '{{.Driver}}']) === 'vfs') {
  const archive = 'go-containerregistry_Linux_x86_64.tar.gz',
    root = 'https://github.com/google/go-containerregistry/releases/download/v0.20.3',
    file = resolve(cache, archive),
    checks = resolve(cache, 'checksums.txt');
  if (!existsSync(file)) run('curl', ['-fLSs', '--retry', '2', root + '/' + archive, '-o', file]);
  run('curl', ['-fLSs', '--retry', '2', root + '/checksums.txt', '-o', checks]);
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex'),
    expected = readFileSync(checks, 'utf8').split('\n').find((l) => l.endsWith(' ' + archive))
      ?.split(/\s+/)[0];
  if (hash !== expected) throw Error('Tool checksum mismatch');
  run('tar', ['-xzf', file, '-C', bin, 'crane']);
  const crane = resolve(bin, 'crane'),
    source = 'ghcr.io/supabase/postgres:17.11.0.004',
    digest = run(crane, ['digest', '--platform', 'linux/amd64', source]);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw Error('Image digest invalid');
  const pinned = 'ghcr.io/supabase/postgres@' + digest,
    config = JSON.parse(run(crane, ['config', '--platform', 'linux/amd64', pinned])).config;
  let local;
  try {
    local = JSON.parse(run('docker', ['image', 'inspect', source]))[0].Config;
  } catch {}
  function same(c) {
    for (
      const key of [
        'Env',
        'Entrypoint',
        'Cmd',
        'Shell',
        'User',
        'WorkingDir',
        'Volumes',
        'ExposedPorts',
        'Healthcheck',
        'StopSignal',
      ]
    ) {
      if (
        !isDeepStrictEqual(
          c[key] ?? (['User', 'WorkingDir', 'StopSignal'].includes(key) ? '' : null),
          config[key] ?? (['User', 'WorkingDir', 'StopSignal'].includes(key) ? '' : null),
        )
      ) return false;
    }
    return Object.entries(config.Labels ?? {}).every(([k, v]) => c.Labels?.[k] === v);
  }
  if (!local || local.Labels?.['org.opencontainers.image.base.digest'] !== digest || !same(local)) {
    console.log('Preparing checksum-verified single-layer PostgreSQL image for VFS');
    const tar = resolve(cache, 'postgres.tar');
    run(crane, ['export', '--platform', 'linux/amd64', pinned, tar]);
    const changes = [], add = (s) => changes.push('--change', s);
    for (const e of config.Env ?? []) {
      const i = e.indexOf('=');
      add('ENV ' + e.slice(0, i) + '=' + JSON.stringify(e.slice(i + 1)));
    }
    for (const k of ['Entrypoint', 'Cmd', 'Shell']) {
      if (config[k]) add(k.toUpperCase() + ' ' + JSON.stringify(config[k]));
    }
    if (config.User) add('USER ' + config.User);
    if (config.WorkingDir) add('WORKDIR ' + JSON.stringify(config.WorkingDir));
    if (config.Volumes) add('VOLUME ' + JSON.stringify(Object.keys(config.Volumes)));
    for (const p of Object.keys(config.ExposedPorts ?? {})) add('EXPOSE ' + p);
    if (config.StopSignal) add('STOPSIGNAL ' + config.StopSignal);
    if (config.Healthcheck) {
      const h = config.Healthcheck;
      if (h.Test[0] === 'NONE') add('HEALTHCHECK NONE');
      else {
        let flags = '';
        for (
          const [k, f] of [['Interval', 'interval'], ['Timeout', 'timeout'], [
            'StartPeriod',
            'start-period',
          ], ['StartInterval', 'start-interval']]
        ) if (h[k]) flags += `--${f}=${h[k]}ns `;
        if (h.Retries) flags += `--retries=${h.Retries} `;
        add(
          'HEALTHCHECK ' + flags + 'CMD ' +
            (h.Test[0] === 'CMD' ? JSON.stringify(h.Test.slice(1)) : h.Test.slice(1).join(' ')),
        );
      }
    }
    for (const [k, v] of Object.entries(config.Labels ?? {})) {
      add('LABEL ' + k + '=' + JSON.stringify(v));
    }
    add('LABEL org.opencontainers.image.base.digest=' + digest);
    run('docker', ['import', ...changes, tar, source]);
    local = JSON.parse(run('docker', ['image', 'inspect', source]))[0].Config;
    if (!same(local)) throw Error('Runtime image configuration mismatch');
    unlinkSync(tar);
  }
  writeFileSync(
    resolve(cache, 'provenance.json'),
    JSON.stringify({ source, digest, derived: true, configurationVerified: true }),
  );
}
execFileSync('docker', [
  'build',
  '-t',
  'ghcr.io/supabase/gotrue:v2.197.0',
  'scripts/local-auth-probe',
], { stdio: 'inherit', env: { ...process.env, DOCKER_BUILDKIT: '0' } });
