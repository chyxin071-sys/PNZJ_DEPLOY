import { create } from 'zustand';
import { uploadFile } from '@/utils/cloudStorage';

export type UploadTaskStatus = 'queued' | 'uploading' | 'success' | 'error';

export interface UploadTask {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
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

export const useUploadQueueStore = create<UploadQueueState>((set, get) => ({
  tasks: [],
  activeTaskId: null,
  panelOpen: false,

  addTasks: (items) => {
    const tasks: UploadTask[] = items.map(item => ({
      ...item,
      id: makeTaskId(),
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
    set(state => ({
      tasks: state.tasks.filter(task => task.id !== taskId || task.status === 'uploading'),
    }));
  },

  clearFinished: () => {
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
