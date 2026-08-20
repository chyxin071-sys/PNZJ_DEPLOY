import { create } from 'zustand';
import { uploadFile } from '@/utils/cloudStorage';

export type UploadTaskStatus = 'queued' | 'uploading' | 'success' | 'error';

export interface UploadTask {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  previewUrl?: string;
  folder: string;
  title: string;
  context?: Record<string, string | number | boolean | undefined>;
  status: UploadTaskStatus;
  progress: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
  onSuccess: (result: { fileID: string; task: UploadTask }) => Promise<void> | void;
}

interface UploadQueueState {
  tasks: UploadTask[];
  activeTaskId: string | null;
  panelOpen: boolean;
  addTasks: (tasks: Array<Omit<UploadTask, 'id' | 'status' | 'progress' | 'createdAt'>>) => string[];
  retryTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  clearFinished: () => void;
  setPanelOpen: (open: boolean) => void;
  runNext: () => void;
}

const makeTaskId = () => `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const makePreviewUrl = (file: File) => {
  if ((file as File & { __pnzjNativePlaceholder?: boolean }).__pnzjNativePlaceholder) return undefined;
  if (typeof URL === 'undefined' || !file.type.match(/^(image|video)\//)) return undefined;
  try {
    return URL.createObjectURL(file);
  } catch {
    return undefined;
  }
};

const revokePreviewUrl = (task?: UploadTask) => {
  if (!task?.previewUrl || task.previewUrl.startsWith('data:') || typeof URL === 'undefined') return;
  try {
    URL.revokeObjectURL(task.previewUrl);
  } catch {
    // The browser may already have released the object URL.
  }
};

export const useUploadQueueStore = create<UploadQueueState>((set, get) => ({
  tasks: [],
  activeTaskId: null,
  panelOpen: false,

  addTasks: (items) => {
    const tasks: UploadTask[] = items.map(item => ({
      ...item,
      id: makeTaskId(),
      previewUrl: makePreviewUrl(item.file),
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
    }));
    set(state => ({ tasks: [...state.tasks, ...tasks], panelOpen: true }));
    window.setTimeout(() => get().runNext(), 0);
    return tasks.map(task => task.id);
  },

  retryTask: (taskId) => {
    set(state => ({
      tasks: state.tasks.map(task =>
        task.id === taskId ? { ...task, status: 'queued', progress: 0, error: undefined } : task
      ),
      panelOpen: true,
    }));
    window.setTimeout(() => get().runNext(), 0);
  },

  removeTask: (taskId) => {
    const task = get().tasks.find(item => item.id === taskId && item.status !== 'uploading');
    revokePreviewUrl(task);
    set(state => ({
      tasks: state.tasks.filter(task => task.id !== taskId || task.status === 'uploading'),
    }));
  },

  clearFinished: () => {
    get().tasks
      .filter(task => task.status !== 'queued' && task.status !== 'uploading')
      .forEach(revokePreviewUrl);
    set(state => ({ tasks: state.tasks.filter(task => task.status === 'queued' || task.status === 'uploading') }));
  },

  setPanelOpen: (open) => set({ panelOpen: open }),

  runNext: async () => {
    const state = get();
    if (state.activeTaskId) return;
    const task = state.tasks.find(item => item.status === 'queued');
    if (!task) return;

    set(current => ({
      activeTaskId: task.id,
      tasks: current.tasks.map(item =>
        item.id === task.id ? { ...item, status: 'uploading', progress: 8, error: undefined } : item
      ),
    }));

    try {
      const tick = window.setInterval(() => {
        set(current => ({
          tasks: current.tasks.map(item =>
            item.id === task.id && item.status === 'uploading'
              ? { ...item, progress: Math.min(88, item.progress + 6) }
              : item
          ),
        }));
      }, 1200);

      const result = await uploadFile(task.file, task.folder);
      window.clearInterval(tick);
      await task.onSuccess({ fileID: result.fileID, task });

      set(current => ({
        activeTaskId: null,
        tasks: current.tasks.map(item =>
          item.id === task.id ? { ...item, status: 'success', progress: 100, completedAt: Date.now() } : item
        ),
      }));
      window.setTimeout(() => {
        revokePreviewUrl(get().tasks.find(item => item.id === task.id));
        set(current => ({
          tasks: current.tasks.filter(item => item.id !== task.id || item.status !== 'success'),
        }));
      }, 3000);
    } catch (err: any) {
      set(current => ({
        activeTaskId: null,
        tasks: current.tasks.map(item =>
          item.id === task.id
            ? { ...item, status: 'error', progress: 0, error: err?.message || '上传失败' }
            : item
        ),
        panelOpen: true,
      }));
    } finally {
      window.setTimeout(() => get().runNext(), 0);
    }
  },
}));
