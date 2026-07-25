import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Users, Target, TrendingUp, ArrowUpRight,
  ArrowDownRight, Calendar, Star, Phone, MapPin,
  Clock, Award, Layers
} from 'lucide-react';
import { leadsAPI, todosAPI, projectsAPI, usersAPI, followUpsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';

export default function Analytics() {
  const { user } = useAuthStore();
  const [leads, setLeads] = useState<any[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [leadsRes, todosRes, projectsRes, employeesRes, followUpsRes] = await Promise.all([
      leadsAPI.toArray(), todosAPI.toArray(), projectsAPI.toArray(),
      usersAPI.toArray(), followUpsAPI.toArray(),
    ]);
    setLeads(leadsRes); setTodos(todosRes); setProjects(projectsRes);
    setEmployees(employeesRes); setFollowUps(followUpsRes);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const now = new Date();
  const cutoff = new Date(now);
  if (timeRange === '7d') cutoff.setDate(now.getDate() - 7);
  else if (timeRange === '30d') cutoff.setDate(now.getDate() - 30);
  else if (timeRange === '90d') cutoff.setDate(now.getDate() - 90);
  const cutoffTime = cutoff.getTime();
  const filteredLeads = timeRange === 'all' ? leads : leads.filter(l => new Date(l.createdAt || 0).getTime() >= cutoffTime);
  const filteredFollowUps = timeRange === 'all' ? followUps : followUps.filter(f => new Date(f.createdAt || 0).getTime() >= cutoffTime);

  // 转化率趋势
  const signedCount = filteredLeads.filter(l => l.status === '已签单').length;
  const lostCount = filteredLeads.filter(l => l.status === '已流失').length;
  const followCount = filteredLeads.filter(l => l.status === '跟进中').length;
  const convRate = filteredLeads.length > 0 ? ((signedCount / filteredLeads.length) * 100).toFixed(1) : '0.0';

  // 每日新增趋势
  const dailyNew: Record<string, number> = {};
  const dailySigned: Record<string, number> = {};
  filteredLeads.forEach(l => {
    const date = (l.createdAt || '').slice(0, 10);
    if (!date) return;
    dailyNew[date] = (dailyNew[date] || 0) + 1;
    if (l.status === '已签单') dailySigned[date] = (dailySigned[date] || 0) + 1;
  });
  const sortedDays = Object.keys(dailyNew).sort();

  // 跟进活跃度
  const followTypes: Record<string, number> = {};
  filteredFollowUps.forEach(f => {
    followTypes[f.type] = (followTypes[f.type] || 0) + 1;
  });

  // 员工表现
  const empStats = employees.filter(e => ['sales', 'designer', 'manager', 'admin'].includes(e.role)).map(emp => {
    const leadsCount = filteredLeads.filter(l => l.sales === emp.name || l.designer === emp.name || l.manager === emp.name).length;
    const signed = filteredLeads.filter(l => l.status === '已签单' && (l.sales === emp.name || l.designer === emp.name)).length;
    const rate = leadsCount > 0 ? ((signed / leadsCount) * 100).toFixed(0) : '0';
    const followCount = filteredFollowUps.filter(f => f.creatorName === emp.name).length;
    return { name: emp.name, role: emp.role, department: emp.department, leadsCount, signed, rate: parseInt(rate), followCount };
  }).sort((a, b) => b.leadsCount - a.leadsCount);

  // 客户来源分析
  const sourceAnalysis = [...new Set(filteredLeads.map(l => l.source).filter(Boolean))].map(s => {
    const srcLeads = filteredLeads.filter(l => l.source === s);
    const srcSigned = srcLeads.filter(l => l.status === '已签单').length;
    const srcRate = srcLeads.length > 0 ? ((srcSigned / srcLeads.length) * 100).toFixed(0) : '0';
    return { name: s, count: srcLeads.length, signed: srcSigned, rate: parseInt(srcRate) };
  }).sort((a, b) => b.count - a.count);

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">加载中...</div>;

  return (
    <div className="erp-page mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h1 className="text-base md:text-xl font-bold text-gray-900">数据分析</h1>
          <p className="mt-1 text-xs md:text-sm text-gray-500">深入分析业务数据，发现增长趋势</p>
        </div>
        <select value={timeRange} onChange={e => setTimeRange(e.target.value as any)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10">
          <option value="7d">最近 7 天</option>
          <option value="30d">最近 30 天</option>
          <option value="90d">最近 90 天</option>
          <option value="all">全部时间</option>
        </select>
      </div>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-1"><Users size={16} className="text-blue-500" /><span className="text-xs text-gray-400">客户总数</span></div>
          <p className="text-2xl font-bold text-gray-900">{filteredLeads.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-1"><Target size={16} className="text-emerald-500" /><span className="text-xs text-gray-400">转化率</span></div>
          <p className="text-2xl font-bold text-emerald-600">{convRate}%</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-1"><Clock size={16} className="text-amber-500" /><span className="text-xs text-gray-400">跟进次数</span></div>
          <p className="text-2xl font-bold text-gray-900">{filteredFollowUps.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-1"><Layers size={16} className="text-purple-500" /><span className="text-xs text-gray-400">进行中项目</span></div>
          <p className="text-2xl font-bold text-gray-900">{projects.filter(p => p.status === '进行中').length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 客户状态分布 */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">客户状态分布</h3>
          <div className="space-y-3">
            {[{ label: '跟进中', count: followCount, color: 'blue' }, { label: '已签单', count: signedCount, color: 'emerald' }, { label: '已流失', count: lostCount, color: 'rose' }].map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-16">{s.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div className={`bg-${s.color}-500 h-full rounded-full transition-all flex items-center justify-end pr-2`}
                    style={{ width: `${filteredLeads.length > 0 ? (s.count / filteredLeads.length * 100) : 0}%` }}>
                    {s.count > 0 && <span className="text-xs text-white font-medium">{s.count}</span>}
                  </div>
                </div>
                <span className="text-sm text-gray-500 w-10 text-right">
                  {filteredLeads.length > 0 ? ((s.count / filteredLeads.length) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 跟进方式分布 */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">跟进方式分布</h3>
          <div className="space-y-2">
            {Object.entries(followTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-24">{type}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-amber-400 h-full rounded-full transition-all"
                    style={{ width: `${filteredFollowUps.length > 0 ? (count / filteredFollowUps.length * 100) : 0}%` }} />
                </div>
                <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
              </div>
            ))}
            {Object.keys(followTypes).length === 0 && <p className="text-xs text-gray-400 text-center py-2">暂无跟进数据</p>}
          </div>
        </div>

        {/* 客户来源分析 */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">客户来源与转化</h3>
          <div className="space-y-2">
            {sourceAnalysis.slice(0, 8).map(s => (
              <div key={s.name} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
                <span className="text-sm text-gray-700 w-24 truncate">{s.name}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-400 h-full rounded-full" style={{ width: `${sourceAnalysis[0]?.count > 0 ? (s.count / sourceAnalysis[0].count * 100) : 0}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-12">{s.count} 客户</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.rate >= 30 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>
                  {s.rate}% 转化
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 员工表现 */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">员工表现</h3>
          <div className="space-y-2">
            {empStats.slice(0, 8).map((emp, idx) => (
              <div key={emp.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  idx < 3 ? 'bg-amber-100 text-amber-600' : 'bg-gray-50 text-gray-400'}`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{emp.name}</span>
                    <span className="text-xs text-gray-400">{emp.department || emp.role}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{emp.leadsCount} 客户</span>
                    <span>{emp.signed} 签单</span>
                    <span>{emp.followCount} 跟进</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${emp.rate >= 30 ? 'text-emerald-600' : 'text-gray-400'}`}>{emp.rate}%</p>
                  <p className="text-xs text-gray-400">转化率</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 每日新增趋势 */}
        {sortedDays.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">每日新增客户趋势</h3>
            <div className="flex items-end gap-1 h-40">
              {sortedDays.map(day => {
                const maxCount = Math.max(...Object.values(dailyNew));
                const height = maxCount > 0 ? (dailyNew[day] / maxCount * 100) : 0;
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full relative flex items-end" style={{ height: '120px' }}>
                      <div className="w-full bg-blue-400 rounded-t-sm transition-all hover:bg-blue-500" style={{ height: `${height}%` }} />
                      {dailySigned[day] && (
                        <div className="absolute bottom-0 w-full bg-emerald-400 rounded-t-sm opacity-60" style={{ height: `${maxCount > 0 ? (dailySigned[day] / maxCount * 100) : 0}%` }} />
                      )}
                    </div>
                    <span className="text-[9px] text-gray-400 truncate w-full text-center">{day.slice(5)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400" /> 新增客户</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400 opacity-60" /> 签单</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
