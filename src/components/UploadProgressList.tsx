import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { formatSize } from '@/utils/format';

export type UploadProgressStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface UploadProgressItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: UploadProgressStatus;
  error?: string;
}

export function createUploadProgressItem(file: File): UploadProgressItem & { file: File } {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    file,
    name: file.name,
    size: file.size,
    progress: 0,
    status: 'pending',
  };
}

export default function UploadProgressList({
  items,
  onRemove,
  disabled,
}: {
  items: UploadProgressItem[];
  onRemove?: (id: string) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
      {items.map((item) => {
        const isUploading = item.status === 'uploading';
        const isDone = item.status === 'done';
        const isError = item.status === 'error';
        const statusText = isDone ? '已上传' : isError ? '上传失败' : isUploading ? '上传中' : '待上传';
        const barColor = isError ? 'bg-red-500' : isDone ? 'bg-emerald-500' : 'bg-gold-500';

        return (
          <div key={item.id} className="bg-white px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-700" title={item.name}>{item.name}</p>
                <p className="mt-0.5 text-xs text-gray-400">{formatSize(item.size)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                {isUploading && <Loader2 size={13} className="animate-spin text-gold-600" />}
                {isDone && <CheckCircle2 size={13} className="text-emerald-500" />}
                {isError && <XCircle size={13} className="text-red-500" />}
                <span className={isError ? 'text-red-500' : isDone ? 'text-emerald-600' : 'text-gray-500'}>{statusText}</span>
                {onRemove && !isUploading && !isDone && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemove(item.id)}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-40"
                  >
                    移除
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                style={{ width: `${Math.max(0, Math.min(item.progress, 100))}%` }}
              />
            </div>
            {item.error && <p className="mt-1.5 text-xs text-red-500">{item.error}</p>}
          </div>
        );
      })}
    </div>
  );
}
