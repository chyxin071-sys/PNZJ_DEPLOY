import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Eye, Loader2, X } from 'lucide-react';
import { cloudDB } from '@/db/cloudbase';
import { projectsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';

function formatTime(value: any) {
  if (!value) return '-';
  const raw = value?.toDate ? value.toDate() : value;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getStatusMeta(status = 'pending') {
  if (status === 'approved') return { text: '已通过', cls: 'bg-emerald-50 text-emerald-700' };
  if (status === 'rejected') return { text: '已拒绝', cls: 'bg-red-50 text-red-700' };
  return { text: '待审核', cls: 'bg-amber-50 text-amber-700' };
}

export default function ProjectShareAccess() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [project, setProject] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [projectData, accessRes] = await Promise.all([
        projectsAPI.doc(id).get().catch(() => null),
        cloudDB.collection('shareAccess')
          .where({ projectId: id })
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get(),
      ]);
      const projectObj = Array.isArray(projectData) ? projectData[0] : projectData;
      setProject(projectObj || null);
      setRecords(accessRes.data || []);
    } catch (error) {
      console.error('[shareAccess] load failed', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateStatus = async (record: any, status: 'approved' | 'rejected') => {
    const recordId = record._id || record.id;
    if (!recordId) return;
    setBusyId(recordId);
    try {
      const operator = user?.name || user?.username || 'ERP';
      const patch = status === 'approved'
        ? { status, approvedAt: new Date().toISOString(), approvedBy: operator }
        : { status, rejectedAt: new Date().toISOString(), rejectedBy: operator };
      await cloudDB.collection('shareAccess').doc(recordId).update(patch);
      setRecords(prev => prev.map(item => ((item._id || item.id) === recordId ? { ...item, ...patch } : item)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="erp-page max-w-[1100px] mx-auto space-y-4">
      <div className="bg-white rounded md:rounded border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-start gap-3 px-4 md:px-6 py-4">
          <button onClick={() => navigate(`/projects-biz/${id}`)} className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded transition-colors">
            <ArrowLeft className="w-[18px] h-[18px] text-gray-400" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base md:text-lg font-bold text-gray-900 leading-tight">查看申请记录</h1>
            <p className="mt-1 text-xs md:text-sm text-gray-500 break-words">
              {project?.address || project?.customer || '工地'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded md:rounded border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">
            <Loader2 className="w-7 h-7 mx-auto mb-3 animate-spin" />
            <p className="text-sm">加载中...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Eye className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium">暂无查看申请</p>
            <p className="mt-1 text-xs">客户提交申请后会显示在这里。</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {records.map(record => {
              const recordId = record._id || record.id;
              const status = getStatusMeta(record.status);
              const isBusy = busyId === recordId;
              return (
                <div key={recordId || `${record.openid}-${record.createdAt}`} className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm md:text-base font-semibold text-gray-900">{record.name || '未填写姓名'}</h2>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>{status.text}</span>
                      </div>
                      <div className="mt-1 text-xs md:text-sm text-gray-500">
                        {record.phone || '-'} · {record.relation || '未填写关系'}
                      </div>
                    </div>
                    {record.status !== 'approved' && record.status !== 'rejected' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          disabled={isBusy}
                          onClick={() => updateStatus(record, 'approved')}
                          className="inline-flex h-8 items-center gap-1 rounded bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          <Check size={13} /> 通过
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => updateStatus(record, 'rejected')}
                          className="inline-flex h-8 items-center gap-1 rounded bg-gray-100 px-3 text-xs font-semibold text-gray-600 disabled:opacity-50"
                        >
                          <X size={13} /> 拒绝
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <div className="text-gray-400">申请时间</div>
                      <div className="mt-1 font-medium text-gray-700">{formatTime(record.displayTime || record.createdAt)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">通过时间</div>
                      <div className="mt-1 font-medium text-gray-700">{formatTime(record.approvedAt)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">自动通过</div>
                      <div className="mt-1 font-medium text-gray-700">{record.autoApproved ? '是' : '否'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">处理人</div>
                      <div className="mt-1 font-medium text-gray-700">{record.approvedBy || record.rejectedBy || '-'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
