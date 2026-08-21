import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayHistory } from '@/hooks/useOverlayHistory';

interface BottomDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  useHistory?: boolean;
}

export default function BottomDrawer({ open, onClose, children, title, useHistory = true }: BottomDrawerProps) {
  const historyClose = useOverlayHistory(useHistory && open, onClose, 'pnzjDrawerId');
  const requestClose = useHistory ? historyClose : onClose;

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[260] md:hidden" onClick={requestClose}>
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30" />
      {/* 抽屉内容 */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* 拖拽指示条 */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-8 h-1 bg-gray-200 rounded-full" />
        </div>

        {title && (
          <div className="px-5 py-2 border-b border-gray-50">
            <span className="text-sm font-semibold text-gray-800">{title}</span>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
      `}</style>
    </div>,
    document.body
  );
}
