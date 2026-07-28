import { cloudApp, initCloudBase } from '@/db/cloudbase';
import { isMiniProgramWebView } from './miniProgramPreview';

const TEMP_URL_CACHE_KEY = 'pnzj:cloud-temp-urls:v1';
const TEMP_URL_TTL_MS = 30 * 60_000;
const pendingTempUrlRequests = new Map<string, Promise<Record<string, string>>>();

type TempUrlCacheItem = { url: string; expiresAt: number };

function readTempUrlCache(): Record<string, TempUrlCacheItem> {
  try {
    return JSON.parse(window.localStorage.getItem(TEMP_URL_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeTempUrlCache(cache: Record<string, TempUrlCacheItem>) {
  try {
    const entries = Object.entries(cache)
      .filter(([, value]) => value.expiresAt > Date.now())
      .sort((a, b) => b[1].expiresAt - a[1].expiresAt)
      .slice(0, 300);
    window.localStorage.setItem(TEMP_URL_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Restricted WebViews can disable storage; in-memory request dedupe still applies.
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]/g, '_');
}

export interface UploadResult {
  fileID: string;
  requestId?: string;
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Desktop browsers fetch CloudBase files through the same-origin web service.
 * This avoids expiring cross-origin temporary URLs breaking image lightboxes.
 */
export function getWebFileProxyURL(fileID: string): string {
  return `/api/files/${toBase64Url(fileID)}`;
}

const nativeUploadResults = new WeakMap<File, UploadResult>();
const nativeUploadResultsByName = new Map<string, UploadResult>();

export function registerNativeUploadResult(file: File, result: UploadResult) {
  nativeUploadResults.set(file, result);
  nativeUploadResultsByName.set(file.name, result);
  if (nativeUploadResultsByName.size > 100) {
    const oldestName = nativeUploadResultsByName.keys().next().value;
    if (oldestName) nativeUploadResultsByName.delete(oldestName);
  }
}

export async function uploadFile(
  file: File,
  folder: string,
): Promise<UploadResult> {
  const nativeResult = nativeUploadResults.get(file) || nativeUploadResultsByName.get(file.name);
  if (nativeResult?.fileID) return nativeResult;

  await initCloudBase();

  const ext = file.name.split('.').pop() || 'bin';
  const safeName = sanitizeFilename(file.name.replace(/\.[^.]+$/, ''));
  const cloudPath = `${folder}/${Date.now()}_${safeName.slice(0, 20)}.${ext}`;

  const directUpload = (cloudApp as any).uploadFile;
  if (typeof directUpload === 'function') {
    try {
      const res = await directUpload.call(cloudApp, {
        cloudPath,
        filePath: file,
      });
      const fileID = res?.fileID || res?.fileId || res?.fileIDList?.[0];
      if (fileID) return { fileID, requestId: res?.requestId };
    } catch (directError) {
      console.warn('CloudBase direct upload failed, fallback to cloud function upload:', directError);
    }
  }

  try {
    // 将文件转换为 Base64，绕过 CORS
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // 提取纯 base64 字符串（去掉 data:image/jpeg;base64, 等前缀）
        const base64Str = result.split(',')[1];
        resolve(base64Str);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // 调用云函数上传
    const res = await cloudApp.callFunction({
      name: 'uploadFileFromWeb',
      data: {
        cloudPath,
        fileContent: base64Data
      }
    });

    const result = res.result as any;
    if (!result || !result.success) {
      throw new Error(result?.errMsg || '云函数返回失败');
    }

    return { fileID: result.fileID };
  } catch (e: any) {
    const errMsg = e?.message || e?.toString?.() || '未知错误';
    throw new Error(`文件上传失败: ${errMsg}`);
  }
}

export async function getTempFileURL(fileIDs: string[]): Promise<Record<string, string>> {
  if (!import.meta.env.DEV && !isMiniProgramWebView()) {
    return Object.fromEntries(fileIDs.filter(Boolean).map(fileID => [
      fileID,
      fileID.startsWith('cloud://') ? getWebFileProxyURL(fileID) : fileID,
    ]));
  }

  const uniqueIDs = Array.from(new Set(fileIDs.filter(Boolean)));
  const cache = readTempUrlCache();
  const urlMap: Record<string, string> = {};
  const missing = uniqueIDs.filter((fileID) => {
    const cached = cache[fileID];
    if (cached?.url && cached.expiresAt > Date.now()) {
      urlMap[fileID] = cached.url;
      return false;
    }
    return true;
  });
  if (missing.length === 0) return urlMap;

  const requestKey = missing.slice().sort().join('|');
  let request = pendingTempUrlRequests.get(requestKey);
  if (!request) {
    request = (async () => {
      await initCloudBase();
      const result = await cloudApp.getTempFileURL({ fileList: missing }) as any;
      const resolved: Record<string, string> = {};
      for (const file of result?.fileList || []) {
        const fileID = file.fileID || file.fileid;
        const tempFileURL = file.tempFileURL || file.download_url;
        if (fileID && tempFileURL) resolved[fileID] = tempFileURL;
      }
      return resolved;
    })().finally(() => pendingTempUrlRequests.delete(requestKey));
    pendingTempUrlRequests.set(requestKey, request);
  }

  const resolved = await request;
  const expiresAt = Date.now() + TEMP_URL_TTL_MS;
  for (const [fileID, url] of Object.entries(resolved)) cache[fileID] = { url, expiresAt };
  writeTempUrlCache(cache);
  return { ...urlMap, ...resolved };
}

const fileDataURLCache = new Map<string, string>();
const pendingFileDataURLs = new Map<string, Promise<string>>();

export async function getFileDataURL(fileID: string, variant: 'original' | 'thumbnail' = 'original'): Promise<string> {
  await initCloudBase();
  const cacheKey = `${variant}:${fileID}`;
  const cached = fileDataURLCache.get(cacheKey);
  if (cached) return cached;
  const pending = pendingFileDataURLs.get(cacheKey);
  if (pending) return pending;

  const request = cloudApp.callFunction({
    name: 'getFileContentForWeb',
    data: { fileID, variant },
  }).then((response) => {
    const result = response.result as any;
    if (!result?.success || !result.fileContent) {
      throw new Error(result?.errMsg || '云端读取图片失败');
    }
    const dataURL = `data:${result.contentType || 'image/jpeg'};base64,${result.fileContent}`;
    fileDataURLCache.set(cacheKey, dataURL);
    return dataURL;
  }).finally(() => pendingFileDataURLs.delete(cacheKey));

  pendingFileDataURLs.set(cacheKey, request);
  return request;
}

export async function downloadFile(fileID: string, fileName: string): Promise<void> {
  const urlMap = await getTempFileURL([fileID]);
  const url = urlMap[fileID];
  if (!url) {
    throw new Error('未获取到文件下载地址');
  }

  const safeFileName = fileName || 'download';

  try {
    // 方案1: 通过 fetch 下载文件数据到本地内存（可保留中文文件名）
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error('网络请求失败: ' + response.status);
    const blob = await response.blob();

    // 将 blob 转换为本地对象 URL
    const blobUrl = URL.createObjectURL(blob);

    // 强制使用 a 标签下载，并保留原始文件名
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = safeFileName;
    document.body.appendChild(a);
    a.click();

    // 清理内存和 DOM
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 100);
    return;
  } catch (err) {
    console.warn('Blob 下载失败，尝试降级方案:', err);
  }

  try {
    // 方案2: 直接使用 a 标签 + download 属性（跨域时可能不生效）
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 100);
    return;
  } catch (err) {
    console.warn('直接下载失败，尝试打开链接:', err);
  }

  // 方案3: 最后降级为新标签页打开（可能丢失文件名）
  window.open(url, '_blank');
}

export async function openFilePreview(fileID: string): Promise<string> {
  const urlMap = await getTempFileURL([fileID]);
  return urlMap[fileID] || fileID;
}
