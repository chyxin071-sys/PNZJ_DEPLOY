import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayHistory } from '@/hooks/useOverlayHistory';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  mobileFullScreen?: boolean;
  useHistory?: boolean;
}

export default function Modal({ open, onClose, title, children, size = 'md', mobileFullScreen = false, useHistory = true }: ModalProps) {
  const historyClose = useOverlayHistory(useHistory && open, onClose, 'pnzjModalId');
  const requestClose = useHistory ? historyClose : onClose;

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  const mobileClass = mobileFullScreen
    ? 'max-md:max-w-full max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:m-0 max-md:rounded-none'
    : 'max-sm:max-w-full max-sm:h-full max-sm:max-h-full max-sm:m-0 max-sm:rounded-none';
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={requestClose} />
      <div className={`relative bg-white rounded-lg shadow-2xl w-full ${w} mx-4 max-h-[85vh] flex flex-col border border-gray-100 md:rounded-lg ${mobileClass}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={requestClose} className="w-8 h-8 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 px-6 py-5 overflow-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
