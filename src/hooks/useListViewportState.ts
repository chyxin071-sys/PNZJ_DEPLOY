import { useCallback, useEffect, useMemo, useState } from 'react';

const getMainScrollContainer = () => document.querySelector('[data-scroll="main"]') as HTMLElement | null;

export function usePageScrollRestore(storageKey: string, ready = true) {
  useEffect(() => {
    if (!ready) return;
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;

    const restore = () => {
      const container = getMainScrollContainer();
      if (!container) return;
      container.scrollTo(0, Number(saved) || 0);
      sessionStorage.removeItem(storageKey);
    };

    queueMicrotask(restore);
    window.setTimeout(restore, 80);
  }, [ready, storageKey]);

  return useCallback(() => {
    const container = getMainScrollContainer();
    if (container) sessionStorage.setItem(storageKey, String(container.scrollTop));
  }, [storageKey]);
}

export function useIncrementalList<T>(
  items: T[],
  storageKey: string,
  resetKey: string,
  initialCount = 20,
  step = 20,
) {
  const scopedKey = `${storageKey}:${resetKey}`;
  const [visibleCount, setVisibleCount] = useState(() => {
    const saved = sessionStorage.getItem(scopedKey);
    return saved ? Math.max(initialCount, Number(saved) || initialCount) : initialCount;
  });

  useEffect(() => {
    const saved = sessionStorage.getItem(scopedKey);
    setVisibleCount(saved ? Math.max(initialCount, Number(saved) || initialCount) : initialCount);
  }, [initialCount, scopedKey]);

  useEffect(() => {
    sessionStorage.setItem(scopedKey, String(visibleCount));
  }, [scopedKey, visibleCount]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;
  const loadMore = useCallback(() => {
    setVisibleCount((count) => Math.min(items.length, count + step));
  }, [items.length, step]);

  return { visibleItems, visibleCount: Math.min(visibleCount, items.length), hasMore, loadMore };
}
