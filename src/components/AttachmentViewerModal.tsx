import { Download, Eye, Trash2, Clock } from 'lucide-react';
import Modal from './Modal';
import { normalizeAttachments, downloadAttachment, openAttachment } from '@/utils/financeAttachments';
import { formatDateTime } from '@/utils/format';
import type { AttachmentValue } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  attachments?: AttachmentValue[];
  title?: string;
  onDelete?: (idx: number) => void;
}

export default function AttachmentViewerModal({ isOpen, onClose, attachments, title = '附件列表', onDelete }: Props) {
  if (!isOpen) return null;
  const files = normalizeAttachments(attachments);

  return (
    <Modal open={isOpen} onClose={onClose} title={title}>
      <div className="p-4 space-y-4">
        {files.length === 0 ? (
          <p className="text-center text-gray-500 py-8 text-sm">暂无附件</p>
        ) : (
          <div className="flex flex-col gap-3">
            {files.map((file, idx) => (
              <div
                key={idx}
                onClick={() => { void openAttachment(file); }}
                className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm text-gray-700 cursor-pointer"
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openAttachment(file);
                  }}
                  className="flex-1 min-w-0 pr-4 text-left"
                >
                  <div className="truncate font-medium text-gray-800" title={file.name}>{file.name}</div>
                  {file.uploadTime && (
                    <div className="flex items-center text-[11px] text-gray-400 mt-1">
                      <Clock size={10} className="mr-1" />
                      {formatDateTime(file.uploadTime)}
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void openAttachment(file);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-gray-600 hover:bg-white transition-colors"
                  >
                    <Eye size={14} /> 鎵撳紑
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void downloadAttachment(file);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Download size={14} /> 下载
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (window.confirm('确认删除该附件吗？此操作不可撤销。')) {
                          onDelete(idx);
                        }
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
