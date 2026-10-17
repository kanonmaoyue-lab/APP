import type { SupabaseClient } from '@supabase/supabase-js';
import type { Mode, Place } from '../../domain/types';
import type { Matrices } from '../../domain/optimizer';
import { validPlace } from '../../domain/dates';
export interface RouteClient {
  search(query: string, signal: AbortSignal): Promise<Place[]>;
  matrices(places: Place[], modes: Mode[], signal: AbortSignal): Promise<Matrices>;
}
const messages: Record<string, string> = {
  notConfigured: '地图服务尚未配置，暂时无法查询地点和真实道路耗时。',
  authRequired: '请重新登录后再查询路线。',
  noRoute: '这些地点之间没有可用道路路线，请核对校门与道路是否开放。',
  timeout: '地图服务响应超时，请重试。',
  invalid: '请确认地点和出行方式。',
  origin: '当前网址尚未加入地图服务的允许来源。',
  unavailable: '暂时无法连接地图服务，请稍后重试。',
};
export class RouteClientError extends Error {
  constructor(public code: string, public retryAfter?: number) {
    super(
      code === 'rateLimited'
        ? `查询次数较多，请${retryAfter ?? 60}秒后重试。`
        : messages[code] ?? messages.unavailable,
    );
  }
}
export function createRouteClient(
  request: (input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>,
): RouteClient {
  return {
    async search(query, signal) {
      const v = await request({ action: 'search', query }, signal) as { places?: Place[] };
      signal.throwIfAborted();
      if (!Array.isArray(v.places) || v.places.some((p) => !validPlace(p))) {
        throw new RouteClientError('provider');
      }
      return v.places;
    },
    async matrices(places, modes, signal) {
      if (places.length < 2 || places.length > 9 || places.some((p) => !validPlace(p))) {
        throw new RouteClientError('invalid');
      }
      const result: Matrices = {};
      for (const mode of new Set(modes)) {
        const v = await request({ action: 'matrix', places, mode }, signal) as {
            durations?: unknown;
          },
          rows = v.durations;
        signal.throwIfAborted();
        if (
          !Array.isArray(rows) || rows.length !== places.length ||
          rows.some((row) =>
            !Array.isArray(row) || row.length !== places.length ||
            row.some((x) => x !== null && (typeof x !== 'number' || !Number.isFinite(x) || x < 0))
          )
        ) throw new RouteClientError('provider');
        result[mode] = rows;
      }
      return result;
    },
  };
}
export function cloudRoutes(client: SupabaseClient) {
  return createRouteClient(async (input, signal) => {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new RouteClientError('authRequired');
    const { data: body, error } = await client.functions.invoke('route-service', {
      body: input,
      signal,
    });
    if (error) {
      let info: { code?: string; retryAfter?: number } = {};
      if (error.context instanceof Response) {
        try {
          info = await error.context.json();
        } catch {}
      }
      throw new RouteClientError(info.code ?? 'unavailable', info.retryAfter);
    }
    return body;
  });
}
