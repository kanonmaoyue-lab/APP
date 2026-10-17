export interface Place {
  label: string;
  lat: number;
  lon: number;
}
export type RouteRequest = { action: 'search'; query: string } | {
  action: 'matrix' | 'directions';
  mode: 'walking' | 'cycling';
  places: Place[];
};
export class RouteError extends Error {
  constructor(public code: string, public status = 502, public retryAfter?: number) {
    super(code);
  }
}
export function validCoordinates(lat: unknown, lon: unknown) {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) &&
    Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}
export function createProvider(key: string, fetcher: typeof fetch = fetch) {
  return async (input: RouteRequest, signal?: AbortSignal): Promise<unknown> => {
    const profile = input.action === 'search'
        ? ''
        : input.mode === 'walking'
        ? 'foot-walking'
        : 'cycling-regular',
      url = new URL(
        input.action === 'search'
          ? 'https://api.openrouteservice.org/geocode/search'
          : `https://api.openrouteservice.org/v2/${
            input.action === 'matrix' ? 'matrix' : 'directions'
          }/${profile}${input.action === 'directions' ? '/geojson' : ''}`,
      );
    if (input.action === 'search') {
      url.searchParams.set('api_key', key);
      url.searchParams.set('text', input.query);
      url.searchParams.set('boundary.country', 'CHN');
      url.searchParams.set('size', '8');
    }
    const coords = input.action === 'search' ? null : input.places.map((p) => [p.lon, p.lat]);
    let response: Response;
    try {
      response = await fetcher(url, {
        method: input.action === 'search' ? 'GET' : 'POST',
        headers: { Authorization: key, 'Content-Type': 'application/json' },
        body: input.action === 'search' ? undefined : JSON.stringify(
          input.action === 'matrix'
            ? { locations: coords, metrics: ['duration'], resolve_locations: false }
            : { coordinates: coords, instructions: false },
        ),
        signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
      });
    } catch (e) {
      throw new RouteError(
        signal?.aborted
          ? 'cancelled'
          : e instanceof Error && e.name === 'TimeoutError'
          ? 'timeout'
          : 'unavailable',
        signal?.aborted ? 499 : 504,
      );
    }
    if (response.status === 429) {
      const raw = response.headers.get('retry-after'),
        seconds = raw && /^\d+$/.test(raw)
          ? Number(raw)
          : raw && Number.isFinite(Date.parse(raw))
          ? Math.ceil((Date.parse(raw) - Date.now()) / 1000)
          : 60;
      throw new RouteError('rateLimited', 429, Math.max(1, Math.min(86400, seconds)));
    }
    if (!response.ok) {
      let code = 0;
      try {
        code = (await response.json()).error?.code;
      } catch {}
      throw new RouteError([2009, 2010, 6010].includes(code) ? 'noRoute' : 'provider');
    }
    let v;
    try {
      v = await response.json();
    } catch {
      throw new RouteError('provider');
    }
    if (input.action === 'search') {
      if (!Array.isArray(v.features)) throw new RouteError('provider');
      return {
        places: v.features.flatMap(
          (f: { properties?: { label?: unknown }; geometry?: { coordinates?: number[] } }) => {
            const c = f.geometry?.coordinates, label = f.properties?.label;
            return c && typeof label === 'string' && label.trim() && label.length <= 500 &&
                validCoordinates(c[1], c[0])
              ? [{ label, lat: c[1], lon: c[0] }]
              : [];
          },
        ),
      };
    }
    if (input.action === 'matrix') {
      const n = input.places.length;
      if (
        !Array.isArray(v.durations) || v.durations.length !== n ||
        v.durations.some((row: unknown) =>
          !Array.isArray(row) || row.length !== n ||
          row.some((s) => s !== null && (typeof s !== 'number' || !Number.isFinite(s) || s < 0))
        )
      ) throw new RouteError('provider');
      return { durations: v.durations };
    }
    const feature = v.features?.[0],
      summary = feature?.properties?.summary,
      coordinates = feature?.geometry?.coordinates;
    if (
      !summary || !Number.isFinite(summary.duration) || !Number.isFinite(summary.distance) ||
      !Array.isArray(coordinates) ||
      coordinates.some((c) => !Array.isArray(c) || !validCoordinates(c[1], c[0]))
    ) throw new RouteError('noRoute');
    return {
      duration: summary.duration,
      distance: summary.distance,
      coordinates: coordinates.map((c) => c.slice(0, 2)),
    };
  };
}
