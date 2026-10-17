import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthExpired, Rejected, type Transport } from './engine';
import { type ApplyResult, type Batch, type Entity, type SyncPage, tables } from '../domain/types';
import { validateEvent } from '../domain/dates';
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('同步响应格式错误');
  return v as Record<string, unknown>;
}
function cursor(v: unknown): string {
  if (typeof v !== 'string' || !/^\d+$/.test(v)) throw Error('同步游标错误');
  return v;
}
const uuid = (v: unknown) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function entity(v: unknown): Entity {
  const e = object(v);
  if (
    !uuid(e.id) || !uuid(e.userId) || !tables.includes(e.table as Entity['table']) ||
    !Number.isSafeInteger(e.version) || Number(e.version) < 1 || typeof e.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(e.updatedAt)) ||
    e.deletedAt !== null &&
      (typeof e.deletedAt !== 'string' || !Number.isFinite(Date.parse(e.deletedAt)))
  ) throw Error('同步记录格式错误');
  if (e.table === 'events') validateEvent(e as unknown as Extract<Entity, { table: 'events' }>);
  return e as unknown as Entity;
}
function array(v: unknown) {
  if (!Array.isArray(v)) throw Error('同步数据格式错误');
  return v;
}
function batch(v: unknown): Batch {
  const b = object(v);
  if (!uuid(b.operationId)) throw Error('同步操作标识错误');
  return {
    cursor: cursor(b.cursor),
    operationId: String(b.operationId),
    entities: array(b.entities).map(entity),
  };
}
export function parseApply(v: unknown): ApplyResult {
  const r = object(v);
  if (r.status === 'applied') return { status: 'applied', batch: batch(r.batch) };
  if (r.status === 'conflict' && typeof r.reason === 'string') {
    return { status: 'conflict', reason: r.reason, entities: array(r.entities).map(entity) };
  }
  throw Error('同步响应错误');
}
export function parsePage(v: unknown): SyncPage {
  const p = object(v);
  if (typeof p.hasMore !== 'boolean') throw Error('同步分页错误');
  return { cursor: cursor(p.cursor), batches: array(p.batches).map(batch), hasMore: p.hasMore };
}
export function createTransport(client: SupabaseClient): Transport {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error, status } = await client.rpc(name, args).abortSignal(
      AbortSignal.timeout(20000),
    );
    if (error) {
      if (status === 401 || ['28000', 'PGRST301'].includes(error.code)) {
        throw new AuthExpired('登录已过期，请重新登录；本地修改仍然保留。');
      }
      if (status >= 400 && status < 500) throw new Rejected(error.message);
      throw Error('无法连接云端，联网后会继续同步。');
    }
    return data;
  }
  return {
    async apply(operation) {
      return parseApply(await rpc('apply_operation', { operation }));
    },
    async pull(after_cursor) {
      return parsePage(await rpc('pull_changes', { after_cursor, limit_groups: 50 }));
    },
  };
}
