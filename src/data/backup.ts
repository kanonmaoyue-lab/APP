import type { Repository } from './repository';
import { type Of, type Profile, type Table, tables as names } from '../domain/types';
export async function backup(r: Repository, profile: Profile) {
  const tables = Object.fromEntries(
      await Promise.all(names.map(async (t) => [t, await r.list(t, true)])),
    ) as { [T in Table]: Of<T>[] },
    conflicts = await r.conflicts();
  return {
    formatVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    timeZone: profile.timeZone,
    tables,
    sync: { unsyncedCount: (await r.pending()).length, conflictCount: conflicts.length },
    conflicts: conflicts.map((c) => ({
      reason: c.reason,
      local: c.operation.command.kind === 'review'
        ? {
          itemId: c.operation.command.itemId,
          rating: c.operation.command.rating,
          reviewDate: c.operation.command.reviewDate,
        }
        : c.operation.command.changes.map((v) => ({ table: v.table, id: v.id, value: v.value })),
      remote: c.entities,
    })),
  };
}
export async function downloadBackup(r: Repository, profile: Profile) {
  const data = await backup(r, profile),
    blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = '小日子备份-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
