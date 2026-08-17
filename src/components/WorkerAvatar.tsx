import { useEffect, useState } from 'react';
import { getTempFileURL } from '@/utils/cloudStorage';

interface WorkerAvatarProps {
  name: string;
  fileID?: string;
  className?: string;
}

export default function WorkerAvatar({ name, fileID, className = 'h-9 w-9' }: WorkerAvatarProps) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    if (!fileID) {
      setSrc('');
      return () => { active = false; };
    }
    void getTempFileURL([fileID]).then((urls) => {
      if (active) setSrc(urls[fileID] || fileID);
    }).catch(() => {
      if (active) setSrc('');
    });
    return () => { active = false; };
  }, [fileID]);

  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gold-50 text-xs font-semibold text-gold-700 ${className}`}>
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : (name.trim().slice(0, 1) || '工')}
    </span>
  );
}
