import { useEffect, useState } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `Land Ledger | ${title}` : 'Land Ledger | Property Registry';
    return () => {
      document.title = 'Land Ledger | Property Registry';
    };
  }, [title]);
}

/** Simple data fetch hook with loading / error / refetch. */
export function useApi(fetcher, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!immediate && tick === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = () => setTick((t) => t + 1);
  return { data, loading, error, refetch, setData };
}

/** Re-runs when hash of deps changes. */
export function hashOf(obj) {
  return JSON.stringify(obj);
}
