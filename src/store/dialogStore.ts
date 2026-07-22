import { create } from 'zustand';
import React from 'react';

interface DialogOptions {
  title?: string;
  message: React.ReactNode;
  type?: 'alert' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmStyle?: 'primary' | 'danger';
}

interface DialogState {
  isOpen: boolean;
  options: DialogOptions | null;
  showAlert: (message: string, options?: Partial<DialogOptions>) => Promise<void>;
  showConfirm: (message: string, options?: Partial<DialogOptions>) => Promise<boolean>;
  close: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  isOpen: false,
  options: null,
  showAlert: (message, options) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        options: {
          title: '提示',
          confirmText: '确定',
          type: 'alert',
          confirmStyle: 'primary',
          ...options,
          message,
          onConfirm: () => {
            set({ isOpen: false });
            resolve();
          },
          onCancel: () => {
            set({ isOpen: false });
            resolve();
          }
        }
      });
    });
  },
  showConfirm: (message, options) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        options: {
          title: '提示',
          confirmText: '确定',
          cancelText: '取消',
          type: 'confirm',
          confirmStyle: 'primary',
          ...options,
          message,
          onConfirm: () => {
            set({ isOpen: false });
            resolve(true);
          },
          onCancel: () => {
            set({ isOpen: false });
            resolve(false);
          }
        }
      });
    });
  },
  close: () => set({ isOpen: false })
}));
