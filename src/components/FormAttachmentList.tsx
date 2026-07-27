import { Download, Paperclip, X } from 'lucide-react';
import { downloadAttachment, normalizeAttachments } from '@/utils/financeAttachments';
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
    <div className="mt-2 space-y-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-xs font-medium text-gray-500">已有附件</p>
      <div className="flex flex-col gap-2">
        {files.map((file, idx) => (
          <div key={`${file.fileID || file.name}-${idx}`} className="rounded bg-white border border-gray-200 px-3 py-2 text-xs text-gray-600">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip size={13} className="shrink-0 text-gray-400" />
                <span className="min-w-0 break-words" title={file.name}>{file.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void downloadAttachment(file);
                  }}
                  className="inline-flex items-center justify-center gap-1 rounded-md bg-gray-50 px-2.5 py-1.5 text-blue-600 transition-colors hover:bg-blue-50"
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
                  className="inline-flex items-center justify-center gap-1 rounded-md bg-gray-50 px-2.5 py-1.5 text-red-500 transition-colors hover:bg-red-50"
                >
                  <X size={12} /> 删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
