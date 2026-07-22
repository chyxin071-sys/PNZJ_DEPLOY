import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '@/store/notificationStore';

const CATEGORIES = [
  { key: 'all', label: '全部', shortLabel: '全部' },
  { key: 'project', label: '工地相关', shortLabel: '工地' },
  { key: 'lead', label: '客户相关', shortLabel: '客户' },
  { key: 'finance', label: '财务相关', shortLabel: '财务' },
];

// 通知项标签文案（含已从筛选中移除的待办分类，保证列表标签仍显示中文）
const CATEGORY_LABELS: Record<string, string> = {
  todo: '待办相关',
  project: '工地相关',
  lead: '客户相关',
  finance: '财务相关',
  contract: '合同相关',
  system: '系统消息',
};

function notificationSender(item: unknown) {
  const notification = item as { senderName?: string; actorName?: string };
  return notification.senderName || notification.actorName || '系统';
}

function notificationLink(item: {
  link?: string;
  relatedTo?: { type?: string; id?: string };
}) {
  const id = item.relatedTo?.id;
  if (item.link === '/todos' && item.relatedTo?.type === 'todo' && id) {
    return `/todos?todoId=${encodeURIComponent(id)}`;
  }
  if (item.link?.startsWith('/')) return item.link;
  if (!id) return '';
  switch (item.relatedTo?.type) {
    case 'lead':
    case 'customer':
      return `/leads/${id}`;
    case 'project':
      return `/projects-biz/${id}`;
    case 'contract':
      return `/contracts/${id}`;
    case 'todo':
      return `/todos?todoId=${encodeURIComponent(id)}`;
    default:
      return '';
  }
}

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showHistory, setShowHistory] = useState(false);
  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const filteredNotifications = notifications.filter(n => {
    if (!showHistory && new Date(n.createdAt).getTime() < recentCutoff) return false;
    if (categoryFilter === 'all') return true;
    return n.category === categoryFilter || (n.relatedTo?.type === categoryFilter);
  });

  const openNotification = (item: (typeof notifications)[number]) => {
    if (!item.isRead) void markAsRead(item.id);
    const link = notificationLink(item);
    if (link) navigate(link);
  };

  return (
    <div className="erp-page">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base md:text-lg font-bold text-gray-900">消息通知</h1>
          <p className="text-gold-500 text-xs md:text-sm">查看系统提醒、审批动态和业务更新</p>
        </div>
        <button
          type="button"
          onClick={() => void markAllAsRead()}
          disabled={unreadCount === 0}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gold-600 transition-colors hover:bg-gold-50 disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          全部已读
        </button>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-medium text-gray-800">通知列表</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowHistory(value => !value)}
              className="text-xs font-medium text-gold-600 hover:text-gold-700"
            >
              {showHistory ? '仅看近30天' : '查看历史'}
            </button>
            <span className="text-xs text-gray-400">未读 {unreadCount} 条</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
          {CATEGORIES.map(cat => {
            const active = categoryFilter === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setCategoryFilter(cat.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-gold-50 text-gold-600' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className="md:hidden">{cat.shortLabel}</span>
                <span className="hidden md:inline">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-3 rounded-2xl bg-gray-50 p-3 text-gray-400">
              <Bell size={24} />
            </div>
            <p className="text-sm text-gray-500">暂无消息通知</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredNotifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openNotification(item)}
                className={`block w-full px-4 py-4 text-left transition-colors hover:bg-gray-50 ${
                  item.isRead ? 'bg-white' : 'bg-amber-50/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                      item.isRead ? 'bg-gray-300' : 'bg-gold-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
                      {item.category && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{item.content}</p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-400">
                      <span className="truncate">{notificationSender(item)}</span>
                      <span className="shrink-0">
                        {typeof item.createdAt === 'string' ? item.createdAt.slice(0, 10) : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
