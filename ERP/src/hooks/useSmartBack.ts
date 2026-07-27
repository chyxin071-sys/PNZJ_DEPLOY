import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type LocationState = {
  from?: string;
};

function isSafeInternalPath(path?: string) {
  if (!path || typeof path !== 'string') return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.startsWith('/erp/')) return false;
  return true;
}

export function getCurrentReturnPath(pathname: string, search = '') {
  return `${pathname}${search || ''}`;
}

export function useSmartBack(fallbackPath = '/') {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback((overrideFallback?: string) => {
    const fallback = overrideFallback || fallbackPath || '/';
    const stateFrom = (location.state as LocationState | null)?.from;
    const searchFrom = new URLSearchParams(location.search).get('from') || undefined;
    const target = [stateFrom, searchFrom, fallback].find((path) => {
      return isSafeInternalPath(path) && path !== getCurrentReturnPath(location.pathname, location.search);
    });

    navigate(target || '/', { replace: true });
  }, [fallbackPath, location.pathname, location.search, location.state, navigate]);
}
