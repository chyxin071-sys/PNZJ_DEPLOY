import { create } from 'zustand';
import { notificationsAPI } from '@/db/api';
import { cloudDB } from '@/db/cloudbase';
import { generateId } from '@/utils/format';
import type { Notification } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { createNotificationEventSafely, stableOperationId } from '@/services/notificationService';

function normalizeNotificationDate(value: unknown): string {
  if (typeof value === 'string' && value) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();

  const dateLike = value as { toDate?: () => Date } | null;
  if (dateLike && typeof dateLike.toDate === 'function') {
    return dateLike.toDate().toISOString();
  }

  return new Date().toISOString();
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  currentUserId: string;
  loadNotifications: (userId: string) => Promise<void>;
  addNotification: (n: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  currentUserId: '',

  loadNotifications: async (userId: string) => {
    const [legacy, unifiedResult] = await Promise.all([
      notificationsAPI.orderBy('createdAt', 'desc').toArray(),
      cloudDB.collection('notifications').orderBy('createdAt', 'desc').limit(500).get().catch(() => ({ data: [] })),
    ]);
    const unified = ((unifiedResult as { data?: any[] }).data || [])
      .filter((n) => n.targetUserId === userId || (Array.isArray(n.recipientUserIds) && n.recipientUserIds.includes(userId)))
      .map((n) => ({
        ...n,
        id: n._id || n.id,
        type: n.type || '??',
        createdAt: normalizeNotificationDate(n.createdAt || n.createTime),
        _notificationSource: 'unified',
      }));
    const list = [
      ...unified,
      ...legacy
        .filter((n) => n.targetUserId === userId)
        .map((n) => ({ ...n, _notificationSource: 'legacy' })),
    ].sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    set({ notifications: list, unreadCount: list.filter((n) => !n.isRead).length, currentUserId: userId });
  },

  addNotification: async (n) => {
    const record: Notification = {
      id: generateId(),
      ...n,
      createdAt: new Date().toISOString(),
    };
    await notificationsAPI.add(record);
    const actor = useAuthStore.getState().user;
    if (actor?.id && record.targetUserId) {
      void createNotificationEventSafely({
        operationId: stableOperationId('legacy-station-notification', record.id),
        eventType: 'LEGACY_STATION_NOTIFICATION',
        actorUserId: actor.id,
        recipientUserIds: [record.targetUserId],
        category: 'system',
        title: record.title,
        content: record.content,
        link: '/notifications',
        miniProgramPage: '/pages/index/index?erpPath=%2Fnotifications',
        relatedTo: { type: 'notification', id: record.id, name: record.title },
        channels: ['wechat'],
      });
    }
    // 重新加载当前用户的通知
    await get().loadNotifications(get().currentUserId);
  },

  markAsRead: async (id) => {
    const item = get().notifications.find((notification) => notification.id === id) as any;
    if (item?._notificationSource === 'unified' || String(id).startsWith('ndl_')) {
      await cloudDB.collection('notifications').doc(id).update({ isRead: true, readAt: new Date() } as any);
    } else {
      await notificationsAPI.update(id, { isRead: true });
    }
    await get().loadNotifications(get().currentUserId);
  },

  markAllAsRead: async () => {
    const unread = get().notifications.filter((n) => !n.isRead);
    await Promise.all(unread.map((n: any) => (
      n._notificationSource === 'unified' || String(n.id).startsWith('ndl_')
        ? cloudDB.collection('notifications').doc(n.id).update({ isRead: true, readAt: new Date() } as any)
        : notificationsAPI.update(n.id, { isRead: true })
    )));
    await get().loadNotifications(get().currentUserId);
  },
}));
