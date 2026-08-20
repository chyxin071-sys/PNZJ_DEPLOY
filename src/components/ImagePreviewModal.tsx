import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

interface Props {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  layerClassName?: string;
}

export default function ImagePreviewModal({ images, index, onIndexChange, onClose, layerClassName = 'z-[80]' }: Props) {
  const historyPushedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (images.length === 0 || typeof window === 'undefined') return;
    if (!historyPushedRef.current && window.location.hash !== '#image-preview') {
      window.history.pushState({ pnzjImagePreview: true }, '', `${window.location.pathname}${window.location.search}#image-preview`);
      historyPushedRef.current = true;
    }

    const handlePopState = () => {
      if (!historyPushedRef.current) return;
      historyPushedRef.current = false;
      onClose();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [images.length, onClose]);

  if (images.length === 0) return null;

  const safeIndex = Math.max(0, Math.min(index, images.length - 1));
  const previous = () => {
    setDragX(0);
    onIndexChange(safeIndex > 0 ? safeIndex - 1 : images.length - 1);
  };
  const next = () => {
    setDragX(0);
    onIndexChange(safeIndex < images.length - 1 ? safeIndex + 1 : 0);
  };
  const closePreview = () => {
    if (historyPushedRef.current && typeof window !== 'undefined' && window.location.hash === '#image-preview') {
      historyPushedRef.current = false;
      window.history.back();
    }
    onClose();
  };

  return createPortal(
    <div className={`fixed inset-0 ${layerClassName} flex items-center justify-center bg-black/85 p-4`} onClick={closePreview}>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); closePreview(); }}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="关闭图片预览"
      >
        <X size={20} />
      </button>

      {images.length > 1 && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); previous(); }}
          className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:left-8"
          aria-label="上一张"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      <div
        className="h-[90vh] w-[92vw] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          if (images.length <= 1) return;
          const touch = event.touches[0];
          touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          setIsDragging(true);
        }}
        onTouchMove={(event) => {
          if (!touchStartRef.current || images.length <= 1) return;
          const touch = event.touches[0];
          const dx = touch.clientX - touchStartRef.current.x;
          const dy = touch.clientY - touchStartRef.current.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            event.preventDefault();
            setDragX(dx);
          }
        }}
        onTouchEnd={(event) => {
          if (!touchStartRef.current || images.length <= 1) {
            setIsDragging(false);
            return;
          }
          const touch = event.changedTouches[0];
          const dx = touch.clientX - touchStartRef.current.x;
          const dy = touch.clientY - touchStartRef.current.y;
          touchStartRef.current = null;
          setIsDragging(false);
          setDragX(0);
          if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            if (dx < 0) next();
            else previous();
          }
        }}
      >
        <div
          className="flex h-full"
          style={{
            width: `${images.length * 100}%`,
            transform: `translate3d(calc(${-safeIndex * (100 / images.length)}% + ${dragX}px), 0, 0)`,
            transition: isDragging ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {images.map((src, idx) => (
            <div key={`${src}-${idx}`} className="flex h-full items-center justify-center" style={{ width: `${100 / images.length}%` }}>
              <img src={src} alt="图片预览" className="max-h-[90vh] max-w-[92vw] rounded object-contain shadow-2xl" draggable={false} />
            </div>
          ))}
        </div>
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:right-8"
            aria-label="下一张"
          >
            <ChevronRight size={24} />
          </button>
          <div className="absolute bottom-5 rounded-full bg-black/55 px-4 py-1.5 text-sm text-white">
            {safeIndex + 1} / {images.length}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
