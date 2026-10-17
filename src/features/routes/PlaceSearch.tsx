import { useEffect, useRef, useState } from 'react';
import type { Place } from '../../domain/types';
import type { RouteClient } from './client';
export function PlaceSearch(
  { label, value, onChange, client }: {
    label: string;
    value: Place | null;
    onChange: (p: Place | null) => void;
    client: RouteClient;
  },
) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<Place[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    request = useRef<AbortController | null>(null),
    revision = useRef(0);
  useEffect(() => () => {
    request.current?.abort();
    revision.current++;
  }, []);
  async function search() {
    request.current?.abort();
    const controller = new AbortController(), n = ++revision.current;
    request.current = controller;
    setBusy(true);
    setResults([]);
    setError('');
    try {
      const places = await client.search(query, controller.signal);
      if (n === revision.current && !controller.signal.aborted) {
        setResults(places);
        if (!places.length) setError('没有找到匹配地点，请试试完整校区与建筑名称。');
      }
    } catch (e) {
      if (n === revision.current && !controller.signal.aborted) {
        setError(e instanceof Error ? e.message : '查询失败');
      }
    } finally {
      if (n === revision.current) setBusy(false);
    }
  }
  return (
    <div className='place-search'>
      <label>
        {label}
        <input
          value={query}
          placeholder='浙江工业大学 莫干山校区 图书馆'
          onChange={(e) => {
            request.current?.abort();
            revision.current++;
            setQuery(e.target.value);
            setBusy(false);
            setResults([]);
            setError('');
          }}
        />
      </label>
      <div className='row'>
        <button
          type='button'
          disabled={busy || query.trim().length < 2}
          onClick={() => void search()}
        >
          {busy ? '正在查找…' : '查找' + label}
        </button>
        {value && (
          <>
            <span className='tag'>已确认：{value.label}</span>
            <button type='button' className='text' onClick={() => onChange(null)}>
              清除{label}
            </button>
          </>
        )}
      </div>
      {results.length > 0 && (
        <div className='stack' role='group' aria-label={label + '搜索结果'}>
          <p className='caption'>请确认具体地点，同名建筑可能位于不同校区。</p>
          {results.map((p, i) => (
            <button
              type='button'
              key={i}
              onClick={() => {
                onChange(p);
                setResults([]);
                setQuery('');
              }}
            >
              <span>{p.label}</span>
              <small>· {p.lat.toFixed(5)}, {p.lon.toFixed(5)}</small>
            </button>
          ))}
        </div>
      )}
      {error && <p role='alert' className='error'>{error}</p>}
    </div>
  );
}
