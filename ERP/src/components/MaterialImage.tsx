import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { getFileDataURL, getTempFileURL } from '@/utils/cloudStorage';
import { isMiniProgramWebView, openNativeMediaPreview } from '@/utils/miniProgramPreview';

type Props = {
  fileID?: string;
  alt?: string;
  className?: string;
  onWebPreview?: (url: string) => void;
};

export default function MaterialImage({ fileID = '', alt = '材料图片', className = '', onWebPreview }: Props) {
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const [url, setUrl] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (!fileID) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fileID]);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setUrl('');
    if (!fileID || !visible) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    const shouldUseCachedThumbnail = fileID.startsWith('cloud://') && (import.meta.env.DEV || isMiniProgramWebView());
    const resolveThumbnail = shouldUseCachedThumbnail
      ? getFileDataURL(fileID, 'thumbnail')
      : getTempFileURL([fileID]).then((urls) => urls[fileID] || fileID);

    resolveThumbnail
      .then((resolvedUrl) => {
        if (!active) return;
        setUrl(resolvedUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [fileID, visible]);

  const preview = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!fileID || failed) return;

    try {
      if (isMiniProgramWebView()) {
        if (openNativeMediaPreview([{ url: fileID, type: 'image' }], 0)) return;
      }

      const previewUrl = import.meta.env.DEV && fileID.startsWith('cloud://')
        ? await getFileDataURL(fileID, 'original')
        : url || fileID;
      onWebPreview?.(previewUrl);
    } catch {
      setFailed(true);
    }
  };

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={preview}
      disabled={!fileID || failed}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-gray-100 text-gray-300 ${fileID && !failed ? 'cursor-zoom-in' : 'cursor-default'} ${className}`}
      aria-label={fileID ? '查看材料大图' : '暂无材料图片'}
    >
      {loading ? (
        <Loader2 size={18} className="animate-spin" />
      ) : url && !failed ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon size={20} />
      )}
    </button>
  );
}
