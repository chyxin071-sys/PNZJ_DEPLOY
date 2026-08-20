import { Clock, Download, Paperclip, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { downloadAttachment, normalizeAttachments } from '@/utils/financeAttachments';
import { formatDateTime } from '@/utils/format';
import { hasRole, useAuthStore } from '@/store/authStore';
import type { AttachmentValue } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  attachments?: AttachmentValue[];
  title?: string;
  onDelete?: (idx: number) => void;
}

export default function AttachmentViewerModal({ isOpen, onClose, attachments, title = '附件列表', onDelete }: Props) {
  const { user } = useAuthStore();
  const isAdmin = hasRole(user?.roles, 'admin', user?.role);
  const myName = user?.name || '';

  if (!isOpen) return null;
  const files = normalizeAttachments(attachments);

  return (
    <Modal open={isOpen} onClose={onClose} title={title}>
      <div className="p-4">
        {files.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">暂无附件</p>
        ) : (
          <div className="flex flex-col gap-3">
            {files.map((file, idx) => {
              const canDelete = Boolean(onDelete && (isAdmin || (file.uploader && file.uploader === myName)));
              return (
                <div key={`${file.fileID || file.name}-${idx}`} className="rounded border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white text-gray-400">
                        <Paperclip size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="break-words font-medium text-gray-800" title={file.name}>{file.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
                          {file.uploadTime && (
                            <span className="inline-flex items-center">
                              <Clock size={10} className="mr-1" />
                              {formatDateTime(file.uploadTime)}
                            </span>
                          )}
                          {file.uploader && <span>{file.uploader}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void downloadAttachment(file);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-blue-600 transition-colors hover:bg-blue-50"
                      >
                        <Download size={14} /> 下载
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (window.confirm('确认删除该附件吗？此操作不可撤销。')) onDelete?.(idx);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-rose-600 transition-colors hover:bg-rose-50"
                        >
                          <Trash2 size={14} /> 删除
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
