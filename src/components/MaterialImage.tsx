import { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { getFileDataURL, getTempFileURL } from '@/utils/cloudStorage';
import { openNativeMediaPreview } from '@/utils/miniProgramPreview';

type Props = {
  fileID?: string;
  alt?: string;
  className?: string;
  onWebPreview?: (url: string) => void;
};

export default function MaterialImage({ fileID = '', alt = '材料图片', className = '', onWebPreview }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(Boolean(fileID));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    if (!fileID) {
      setUrl('');
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    const resolveThumbnail = import.meta.env.DEV && fileID.startsWith('cloud://')
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
  }, [fileID]);

  const preview = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!fileID || failed) return;
    if (openNativeMediaPreview([{ url: fileID, type: 'image' }], 0)) return;
    try {
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

