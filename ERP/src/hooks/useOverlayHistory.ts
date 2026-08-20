import { useCallback, useEffect, useId, useRef } from 'react';

function currentUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

const OVERLAY_TOP_KEY = 'pnzjOverlayTopId';

export function useOverlayHistory(open: boolean, onClose: () => void, stateKey = 'pnzjOverlayId') {
  const overlayId = useId();
  const pushedHistoryRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;

    const currentState = window.history.state || {};
    if (currentState[stateKey] !== overlayId) {
      window.history.pushState(
        { ...currentState, [stateKey]: overlayId, [OVERLAY_TOP_KEY]: overlayId },
        '',
        currentUrl()
      );
      pushedHistoryRef.current = true;
    }

    const handlePopState = () => {
      if (!pushedHistoryRef.current) return;
      pushedHistoryRef.current = false;
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (pushedHistoryRef.current && window.history.state?.[OVERLAY_TOP_KEY] === overlayId) {
        pushedHistoryRef.current = false;
        window.history.back();
      }
    };
  }, [open, overlayId, stateKey]);

  return useCallback(() => {
    if (
      typeof window !== 'undefined'
      && pushedHistoryRef.current
      && window.history.state?.[OVERLAY_TOP_KEY] === overlayId
    ) {
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, [overlayId, stateKey]);
}

export function OverlayHistoryBridge({
  open,
  onClose,
  stateKey,
}: {
  open: boolean;
  onClose: () => void;
  stateKey?: string;
}) {
  useOverlayHistory(open, onClose, stateKey);
  return null;
}
