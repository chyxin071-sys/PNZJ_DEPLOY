import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface Props {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  layerClassName?: string;
}

export default function ImagePreviewModal({ images, index, onIndexChange, onClose, layerClassName = 'z-[80]' }: Props) {
  if (images.length === 0) return null;

  const safeIndex = Math.max(0, Math.min(index, images.length - 1));
  const previous = () => onIndexChange(safeIndex > 0 ? safeIndex - 1 : images.length - 1);
  const next = () => onIndexChange(safeIndex < images.length - 1 ? safeIndex + 1 : 0);

  return createPortal(
    <div className={`fixed inset-0 ${layerClassName} flex items-center justify-center bg-black/85 p-4`} onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
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

      <div className="flex max-h-[90vh] max-w-[92vw] items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <img src={images[safeIndex]} alt="图片预览" className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl" />
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
