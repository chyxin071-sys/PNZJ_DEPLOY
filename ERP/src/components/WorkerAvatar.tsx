import { useEffect, useState } from 'react';
import { getFileDataURL, getTempFileURL } from '@/utils/cloudStorage';
import { isMiniProgramWebView } from '@/utils/miniProgramPreview';

interface WorkerAvatarProps {
  name: string;
  fileID?: string;
  className?: string;
}

export default function WorkerAvatar({ name, fileID, className = 'h-9 w-9' }: WorkerAvatarProps) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc('');
    setFailed(false);
    if (!fileID) {
      return () => { active = false; };
    }

    const shouldUseCachedThumbnail = fileID.startsWith('cloud://')
      && (import.meta.env.DEV || isMiniProgramWebView());
    const resolveAvatar = shouldUseCachedThumbnail
      ? getFileDataURL(fileID, 'thumbnail')
      : getTempFileURL([fileID]).then((urls) => urls[fileID] || fileID);

    void resolveAvatar
      .then((resolvedSrc) => {
        if (active) setSrc(resolvedSrc);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, [fileID]);

  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gold-50 text-xs font-semibold text-gold-700 ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (name.trim().slice(0, 1) || '工')}
    </span>
  );
}
