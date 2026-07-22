import { Download, Eye, X } from 'lucide-react';
import { normalizeAttachments, downloadAttachment, openAttachment } from '@/utils/financeAttachments';
import type { AttachmentValue } from '@/types';

export default function FormAttachmentList({
  attachments,
  onRemove,
}: {
  attachments?: AttachmentValue[];
  onRemove: (idx: number) => void;
}) {
  const files = normalizeAttachments(attachments);
  if (files.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 space-y-2">
      <p className="text-xs text-gray-500 font-medium">已有附件：</p>
      <div className="flex flex-col gap-2">
        {files.map((file, idx) => (
          <div
            key={idx}
            onClick={() => { void openAttachment(file); }}
            className="flex items-center justify-between rounded bg-white border border-gray-200 px-3 py-2 text-xs text-gray-600"
          >
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void openAttachment(file);
              }}
              className="truncate flex-1 text-left hover:text-gold-600 transition-colors"
              title={file.name}
            >
              {file.name}
            </button>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void openAttachment(file);
                }}
                className="text-gray-600 hover:text-gold-600 flex items-center gap-1 transition-colors"
              >
                <Eye size={12} /> 鎵撳紑
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void downloadAttachment(file);
                }}
                className="text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
              >
                <Download size={12} /> 下载
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(idx);
                }}
                className="text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors"
              >
                <X size={12} /> 删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
