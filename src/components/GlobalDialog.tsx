import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDialogStore } from '@/store/dialogStore';
import { AlertCircle, Info, X } from 'lucide-react';

export default function GlobalDialog() {
  const { isOpen, options, close } = useDialogStore();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !options) return null;

  const isDanger = options.confirmStyle === 'danger';
  const Icon = isDanger ? AlertCircle : Info;
  const iconColor = isDanger ? 'text-red-500' : 'text-blue-500';
  const iconBg = isDanger ? 'bg-red-50' : 'bg-blue-50';
  const confirmBtnClass = isDanger
    ? 'bg-red-500 hover:bg-red-600 text-white'
    : 'bg-gold-400 hover:bg-gold-500 text-black';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={() => {
          if (options.type === 'confirm') {
            options.onCancel?.();
          } else {
            options.onConfirm?.();
          }
        }}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden transform transition-all">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
              <Icon size={20} className={iconColor} />
            </div>
            <div className="flex-1 mt-1">
              <h3 className="text-lg font-semibold text-gray-900 leading-none mb-2">
                {options.title}
              </h3>
              <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                {options.message}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
          {options.type === 'confirm' && (
            <button
              onClick={options.onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-colors"
            >
              {options.cancelText}
            </button>
          )}
          <button
            onClick={options.onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors ${confirmBtnClass} ${isDanger ? 'focus:ring-red-500' : 'focus:ring-gold-400'}`}
          >
            {options.confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}