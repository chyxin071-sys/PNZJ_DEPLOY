import { uploadFile, getTempFileURL } from './cloudStorage';
import { formatSize } from './format';
import { isMiniProgramWebView, openNativeFile } from './miniProgramPreview';
import type { AttachmentValue, FileAttachment } from '@/types';

export function getAttachmentFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'doc';
  return 'file';
}

function inferFileName(fileID: string, index: number) {
  if (!fileID) return `附件${index + 1}`;
  try {
    const rawName = fileID.split('?')[0].split('/').pop() || '';
    const decoded = decodeURIComponent(rawName);
    if (decoded && decoded.includes('.')) return decoded;
  } catch {
    // Legacy values may not contain a valid encoded path.
  }
  return `附件${index + 1}`;
}

export function sanitizeDownloadName(name: string) {
  return (name || 'download')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[.\s]+$/g, '')
    .slice(0, 180) || 'download';
}

export function normalizeAttachment(item: AttachmentValue, index = 0): FileAttachment {
  if (typeof item === 'string') {
    const isImageLike = item.startsWith('data:image/');
    const name = isImageLike ? `附件${index + 1}.png` : inferFileName(item, index);
    return {
      fileID: item,
      name,
      type: isImageLike ? 'image' : getAttachmentFileType(name),
    };
  }

  const legacyUrl = (item as FileAttachment & { url?: string }).url || '';
  const fileID = item.fileID || legacyUrl;
  const name = item.name || inferFileName(fileID, index);
  return {
    ...item,
    fileID,
    name,
    type: item.type || getAttachmentFileType(name),
  };
}

export function normalizeAttachments(items?: AttachmentValue[]): FileAttachment[] {
  return (items || []).map((item, index) => normalizeAttachment(item, index));
}

export function mergeAttachments(
  existing?: AttachmentValue[],
  appended?: AttachmentValue[],
): FileAttachment[] {
  return [...normalizeAttachments(existing), ...normalizeAttachments(appended)];
}

export async function uploadFinanceAttachments(
  files: File[],
  folder: string,
  uploader?: string,
): Promise<FileAttachment[]> {
  const uploaded: FileAttachment[] = [];

  for (const file of files) {
    const uploadTime = new Date().toISOString();
    const result = await uploadFile(file, folder);

    uploaded.push({
      fileID: result.fileID,
      name: file.name,
      size: file.size,
      sizeStr: formatSize(file.size),
      type: getAttachmentFileType(file.name),
      uploader: uploader || 'ERP系统',
      uploadTime,
    });
  }

  return uploaded;
}

export async function resolveAttachmentUrl(file: AttachmentValue): Promise<string> {
  const attachment = normalizeAttachment(file);
  const fileID = attachment.fileID;

  if (!fileID) return '';
  if (fileID.startsWith('data:') || /^https?:\/\//.test(fileID)) return fileID;

  const urlMap = await getTempFileURL([fileID]);
  return urlMap[fileID] || fileID;
}

function openBrowserUrl(url: string, previewWindow: Window | null) {
  if (previewWindow) {
    previewWindow.location.href = url;
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export async function openAttachment(file: AttachmentValue): Promise<void> {
  const attachment = normalizeAttachment(file);
  const previewWindow = isMiniProgramWebView()
    ? null
    : window.open('', '_blank', 'noopener,noreferrer');
  try {
    const url = await resolveAttachmentUrl(attachment);
    if (!url) throw new Error('未获取到附件地址');

    if (attachment.type !== 'image' && attachment.type !== 'video' && openNativeFile(url, sanitizeDownloadName(attachment.name), 'open')) {
      return;
    }

    openBrowserUrl(url, previewWindow);
  } catch (error) {
    previewWindow?.close();
    console.error('Failed to open attachment', error);
  }
}

export async function downloadAttachment(file: AttachmentValue): Promise<void> {
  const attachment = normalizeAttachment(file);
  if (!attachment.fileID) throw new Error('未获取到附件地址');

  const downloadName = sanitizeDownloadName(attachment.name);
  document.body.style.cursor = 'wait';

  try {
    const url = await resolveAttachmentUrl(attachment);
    if (!url) throw new Error('未获取到附件地址');

    if (openNativeFile(url, downloadName, 'download')) return;

    if (url.startsWith('data:')) {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error('网络请求失败');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = blobUrl;
    anchor.download = downloadName;
    document.body.appendChild(anchor);
    anchor.click();

    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
    }, 100);
  } catch (error) {
    console.warn('下载失败，尝试浏览器兼容方案:', error);
    const fallbackUrl = await resolveAttachmentUrl(attachment);
    if (fallbackUrl) {
      const anchor = document.createElement('a');
      anchor.href = fallbackUrl;
      anchor.download = downloadName;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  } finally {
    document.body.style.cursor = 'default';
  }
}

export function getAttachmentSummary(files?: AttachmentValue[]): string {
  const list = normalizeAttachments(files);
  if (list.length === 0) return '未上传附件';
  return `${list.length} 个附件`;
}
