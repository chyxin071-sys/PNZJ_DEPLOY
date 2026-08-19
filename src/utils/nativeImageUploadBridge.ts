import { cloudApp, initCloudBase } from '@/db/cloudbase';
import { readCloudFunctionResult } from '@/utils/cloudFunctionResult';
import { registerNativeUploadResult } from '@/utils/cloudStorage';
import { getWechatBridgeSession } from '@/services/wechatBridge';
import { isMiniProgramWebView, openNativeMiniProgramRoute } from '@/utils/miniProgramPreview';

type NativeUploadFile = {
  fileID?: string;
  name?: string;
  type?: string;
  size?: number;
  previewDataURL?: string;
};

type UploadRequestResult = {
  success: boolean;
  code?: string;
  message?: string;
  requestId?: string;
  status?: 'pending' | 'selecting' | 'uploading' | 'completed' | 'cancelled' | 'failed';
  files?: NativeUploadFile[];
};

const NATIVE_UPLOAD_PAGE = '/pages/native-upload/index';
const POLL_INTERVAL_MS = 700;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;
const ENABLE_NATIVE_IMAGE_UPLOAD_BRIDGE = true;
let activeSelection = false;

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function acceptsImages(input: HTMLInputElement) {
  const accept = input.accept.toLowerCase();
  return accept.split(',').some(value => value.trim().startsWith('image/'));
}

function acceptedMediaType(input: HTMLInputElement) {
  return input.accept.toLowerCase().includes('video/') ? 'mixed' : 'image';
}

function dataURLToBytes(dataURL?: string) {
  if (!dataURL) return new Uint8Array([0]);
  const commaIndex = dataURL.indexOf(',');
  if (commaIndex < 0) return new Uint8Array([0]);
  try {
    const binary = window.atob(dataURL.slice(commaIndex + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return new Uint8Array([0]);
  }
}

async function callUploadBridge(data: Record<string, unknown>) {
  await initCloudBase();
  const response = await cloudApp.callFunction({
    name: 'notificationService',
    parse: true,
    data,
  });
  return readCloudFunctionResult<UploadRequestResult>(response)
    || { success: false, code: 'EMPTY_RESPONSE', message: '小程序上传服务未返回结果' };
}

async function waitForUploadResult(
  sessionId: string,
  requestId: string,
  onUploading?: (files: NativeUploadFile[], completion: Promise<NativeUploadFile[]>) => void,
) {
  const startedAt = Date.now();
  let resolveCompletion!: (files: NativeUploadFile[]) => void;
  let rejectCompletion!: (error: unknown) => void;
  const completion = new Promise<NativeUploadFile[]>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  void completion.catch(() => {});
  let uploadAnnounced = false;

  const fail = (error: unknown): never => {
    rejectCompletion(error);
    throw error;
  };

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    try {
      const result = await callUploadBridge({
        action: 'getNativeUploadResult',
        sessionId,
        requestId,
      });
      if (!result.success) return fail(new Error(result.message || '读取原图上传结果失败'));
      if (result.status === 'uploading' && result.files?.length && !uploadAnnounced) {
        uploadAnnounced = true;
        onUploading?.(result.files, completion);
      }
      if (result.status === 'completed') {
        const files = result.files || [];
        resolveCompletion(files);
        return files;
      }
      if (result.status === 'cancelled') {
        resolveCompletion([]);
        return [];
      }
      if (result.status === 'failed') return fail(new Error(result.message || '原图上传失败'));
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      return fail(error);
    }
  }
  return fail(new Error('等待小程序上传超时，请重新选择图片'));
}

async function openNativeUploadPicker(input: HTMLInputElement) {
  const sessionId = getWechatBridgeSession();
  if (!sessionId) throw new Error('微信上传会话已失效，请重新打开小程序');

  const created = await callUploadBridge({
    action: 'createNativeUploadRequest',
    sessionId,
    count: input.multiple ? 9 : 1,
    mediaType: acceptedMediaType(input),
  });
  if (!created.success || !created.requestId) {
    throw new Error(created.message || '创建原图上传任务失败');
  }

  const opened = openNativeMiniProgramRoute(
    `${NATIVE_UPLOAD_PAGE}?requestId=${encodeURIComponent(created.requestId)}`,
  );
  if (!opened) throw new Error('无法打开微信原图选择器');
  return { sessionId, requestId: created.requestId };
}

function dispatchNativeFiles(
  input: HTMLInputElement,
  uploaded: NativeUploadFile[],
  completion?: Promise<NativeUploadFile[]>,
) {
  const transfer = new DataTransfer();
  uploaded.forEach((item, index) => {
    const type = item.type || 'image/jpeg';
    const extension = type.includes('/') ? type.split('/')[1].replace('jpeg', 'jpg') : 'jpg';
    const file = new File(
      [dataURLToBytes(item.previewDataURL)],
      item.name || `wechat_original_${Date.now()}_${index + 1}.${extension}`,
      { type, lastModified: Date.now() },
    );
    if (item.size && item.size > file.size) {
      Object.defineProperty(file, 'size', { value: item.size });
    }
    const uploadResult = item.fileID
      ? Promise.resolve({ fileID: item.fileID })
      : completion?.then((completed) => {
          const finalFile = completed.find(candidate => candidate.name === item.name) || completed[index];
          if (!finalFile?.fileID) throw new Error(`${item.name || '文件'}上传结果缺失`);
          return { fileID: finalFile.fileID };
        });
    if (!uploadResult) return;
    registerNativeUploadResult(file, uploadResult);
    transfer.items.add(file);
  });
  if (!transfer.files.length) return;
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function installNativeImageUploadBridge() {
  if (!ENABLE_NATIVE_IMAGE_UPLOAD_BRIDGE || !isMiniProgramWebView() || typeof DataTransfer === 'undefined') return () => {};

  const handleClick = async (event: MouseEvent) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input || input.type !== 'file' || input.disabled || !acceptsImages(input)) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeSelection) return;

    activeSelection = true;
    try {
      const { sessionId, requestId } = await openNativeUploadPicker(input);
      activeSelection = false;
      let dispatched = false;
      void waitForUploadResult(sessionId, requestId, (uploading, completion) => {
        dispatched = true;
        dispatchNativeFiles(input, uploading, completion);
      })
        .then((uploaded) => {
          if (!dispatched && uploaded.length) dispatchNativeFiles(input, uploaded);
        })
        .catch((error) => {
          console.error('[native-image-upload]', error);
          window.alert(error instanceof Error ? error.message : '微信原图上传失败，请重试');
        });
    } catch (error) {
      console.error('[native-image-upload]', error);
      window.alert(error instanceof Error ? error.message : '微信原图上传失败，请重试');
    } finally {
      activeSelection = false;
    }
  };

  document.addEventListener('click', handleClick, true);
  return () => document.removeEventListener('click', handleClick, true);
}
