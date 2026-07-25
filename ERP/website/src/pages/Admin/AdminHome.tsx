import { Plus, Edit3, Trash2, Eye, EyeOff, Search, Filter, Grid, List, ArrowUp, ArrowDown, Upload, ArrowDownToLine, User, X, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCases, fetchDesigners, fetchCommunities, createCommunity, updateCommunity, deleteCommunity, uploadImage, deleteCase, updateCase } from '@/api'
import type { Case, Designer, Community } from '@/types'
import AdminLayout from './AdminLayout'

export default function AdminHome() {
  const [cases, setCases] = useState<Case[]>([])
  const [designers, setDesigners] = useState<Designer[]>([])
  const [communities, setCommunities] = useState<Community[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCommunity, setFilterCommunity] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [saving, setSaving] = useState<string | null>(null)
  
  // 小区管理相关
  const [showCommunityManager, setShowCommunityManager] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null)
  const [communityFormData, setCommunityFormData] = useState({
    name: '',
    sortOrder: 0,
    showOnHome: true,
    coverImage: '',
    description: ''
  })
  const [communityDeleteConfirm, setCommunityDeleteConfirm] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [casesData, designersData, communitiesData] = await Promise.all([
        fetchCases(),
        fetchDesigners(),
        fetchCommunities()
      ])
      setCases(casesData.sort((a, b) => a.sortOrder - b.sortOrder))
      setDesigners(designersData)
      setCommunities(communitiesData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDesignerById = (designerId: string): Designer | undefined => {
    return designers.find(d => d.id === designerId)
  }

  // ===== 小区管理相关 =====
  const openAddCommunityModal = () => {
    const maxSort = communities.reduce((max, c) => Math.max(max, c.sortOrder), 0)
    setEditingCommunity(null)
    setCommunityFormData({
      name: '',
      sortOrder: maxSort + 1,
      showOnHome: true,
      coverImage: '',
      description: ''
    })
    setShowModal(true)
  }

  const openEditCommunityModal = (community: Community) => {
    setEditingCommunity(community)
    setCommunityFormData({
      name: community.name,
      sortOrder: community.sortOrder,
      showOnHome: community.showOnHome,
      coverImage: community.coverImage,
      description: community.description
    })
    setShowModal(true)
  }

  const handleCommunitySave = async () => {
    if (!communityFormData.name.trim()) {
      alert('请输入小区名称')
      return
    }
    
    setSaving(editingCommunity?.id || 'new')
    try {
      if (editingCommunity) {
        const updated = await updateCommunity(editingCommunity.id, communityFormData)
        setCommunities(communities.map(c => c.id === editingCommunity.id ? updated : c))
      } else {
        const newCommunity = await createCommunity(communityFormData)
        setCommunities([...communities, newCommunity].sort((a, b) => a.sortOrder - b.sortOrder))
      }
      setShowModal(false)
    } catch (error) {
      console.error('Failed to save:', error)
      alert('保存失败')
    } finally {
      setSaving(null)
    }
  }

  const handleCommunityDelete = async (id: string) => {
    setSaving(id)
    try {
      await deleteCommunity(id)
      setCommunities(communities.filter(c => c.id !== id))
      setCommunityDeleteConfirm(null)
    } catch (error: any) {
      const err = await error.json?.().catch(() => ({})) || {}
      if (err.casesCount) {
        alert(`该小区下还有 ${err.casesCount} 个案例，无法删除`)
      } else {
        alert('删除失败')
      }
    } finally {
      setSaving(null)
    }
  }

  const toggleCommunityShowOnHome = async (community: Community) => {
    setSaving(community.id)
    try {
      const updated = await updateCommunity(community.id, { showOnHome: !community.showOnHome })
      setCommunities(communities.map(c => c.id === community.id ? updated : c))
    } catch (error) {
      console.error('Failed to update:', error)
    } finally {
      setSaving(null)
    }
  }

  const moveCommunity = async (community: Community, direction: 'up' | 'down') => {
    const sorted = [...communities].sort((a, b) => a.sortOrder - b.sortOrder)
    const index = sorted.findIndex(c => c.id === community.id)
    
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === sorted.length - 1) return
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const target = sorted[targetIndex]
    
    setSaving(community.id)
    try {
      const [updated1, updated2] = await Promise.all([
        updateCommunity(community.id, { sortOrder: target.sortOrder }),
        updateCommunity(target.id, { sortOrder: community.sortOrder })
      ])
      
      const newList = communities.map(c => {
        if (c.id === community.id) return updated1
        if (c.id === target.id) return updated2
        return c
      })
      setCommunities(newList.sort((a, b) => a.sortOrder - b.sortOrder))
    } catch (error) {
      console.error('Failed to move:', error)
    } finally {
      setSaving(null)
    }
  }

  const handleCommunityCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setUploading(true)
    try {
      const result = await uploadImage(file)
      setCommunityFormData({ ...communityFormData, coverImage: result.url })
    } catch (error) {
      console.error('Upload failed:', error)
      alert('上传失败')
    } finally {
      setUploading(false)
    }
  }

  const sortedCommunities = [...communities].sort((a, b) => a.sortOrder - b.sortOrder)

  const handleDelete = async (id: string) => {
    try {
      await deleteCase(id)
      setCases(cases.filter(c => c.id !== id))
      setDeleteConfirm(null)
    } catch (error) {
      console.error('Failed to delete case:', error)
    }
  }

  const handleSort = async (id: string, direction: 'up' | 'down') => {
    const index = cases.findIndex(c => c.id === id)
    if (index === -1) return
    
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= cases.length) return
    
    const newCases = [...cases]
    const tempOrder = newCases[index].sortOrder
    newCases[index].sortOrder = newCases[newIndex].sortOrder
    newCases[newIndex].sortOrder = tempOrder
    
    const [moved] = newCases.splice(index, 1)
    newCases.splice(newIndex, 0, moved)
    
    setCases(newCases)
    setSaving(id)
    
    try {
      await updateCase(id, { sortOrder: newCases[newIndex].sortOrder })
      await updateCase(newCases[newIndex].id, { sortOrder: tempOrder })
    } catch (error) {
      console.error('Failed to update sort order:', error)
      loadData()
    } finally {
      setSaving(null)
    }
  }

  const handlePublishToggle = async (caseItem: Case) => {
    setSaving(caseItem.id)
    try {
      const newStatus = caseItem.status === 'published' ? 'draft' : 'published'
      await updateCase(caseItem.id, { status: newStatus })
      setCases(cases.map(c => c.id === caseItem.id ? { ...c, status: newStatus } : c))
    } catch (error) {
      console.error('Failed to update status:', error)
    } finally {
      setSaving(null)
    }
  }

  const filteredCases = cases.filter(c => {
    const designer = getDesignerById(c.designerId)
    const designerName = designer?.name || ''
    const search = searchTerm.toLowerCase()
    const matchesSearch = (c.name || '').toLowerCase().includes(search) ||
                         (c.community || '').toLowerCase().includes(search) ||
                         (c.style || '').toLowerCase().includes(search) ||
                         designerName.toLowerCase().includes(search)
    const matchesCommunity = !filterCommunity || c.community === filterCommunity
    const matchesStatus = !filterStatus || c.status === filterStatus
    return matchesSearch && matchesCommunity && matchesStatus
  })

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-100">
        {/* 顶部导航 */}
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div>
                <h1 className="font-medium text-gray-900">案例管理</h1>
                <p className="text-xs text-gray-500">
                  共 {cases.length} 个案例 · {cases.filter(c => c.status === 'published').length} 已发布 · {cases.filter(c => c.status === 'draft').length} 草稿
                </p>
              </div>
              <button
                onClick={() => navigate('/admin/cases/new')}
                className="flex items-center gap-2 bg-black text-white px-4 py-2 text-sm hover:bg-gray-800 transition-colors"
              >
                <Plus size={18} />
                <span>新建案例</span>
              </button>
            </div>
          </div>
        </header>

        {/* 小区管理区块 */}
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-6">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* 小区管理头部 */}
            <button
              onClick={() => setShowCommunityManager(!showCommunityManager)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-gray-500" />
                <span className="font-medium text-gray-900">小区管理</span>
                <span className="text-xs text-gray-500">({communities.length} 个小区)</span>
              </div>
              {showCommunityManager ? (
                <ChevronUp size={18} className="text-gray-400" />
              ) : (
                <ChevronDown size={18} className="text-gray-400" />
              )}
            </button>
            
            {/* 小区管理内容 */}
            {showCommunityManager && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-500">设置首页展示哪些小区及其排序</p>
                  <button
                    onClick={openAddCommunityModal}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                  >
                    <Plus size={14} />
                    添加小区
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 font-medium w-16">排序</th>
                        <th className="pb-2 font-medium">小区名称</th>
                        <th className="pb-2 font-medium hidden md:table-cell">案例数</th>
                        <th className="pb-2 font-medium">显示</th>
                        <th className="pb-2 font-medium text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortedCommunities.map((community, index) => (
                        <tr key={community.id} className="hover:bg-gray-50">
                          <td className="py-2">
                            <div className="flex gap-1">
                              <button
                                onClick={() => moveCommunity(community, 'up')}
                                disabled={saving === community.id || index === 0}
                                className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                onClick={() => moveCommunity(community, 'down')}
                                disabled={saving === community.id || index === sortedCommunities.length - 1}
                                className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                              >
                                <ArrowDown size={12} />
                              </button>
                            </div>
                          </td>
                          <td className="py-2 font-medium text-gray-900">{community.name}</td>
                          <td className="py-2 text-gray-500 hidden md:table-cell">{community.casesCount || 0}</td>
                          <td className="py-2">
                            <button
                              onClick={() => toggleCommunityShowOnHome(community)}
                              disabled={saving === community.id}
                              className={`flex items-center gap-1 ${community.showOnHome ? 'text-green-600' : 'text-gray-400'}`}
                            >
                              {community.showOnHome ? <Eye size={14} /> : <EyeOff size={14} />}
                              {community.showOnHome ? '显示' : '隐藏'}
                            </button>
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditCommunityModal(community)}
                                className="p-1 text-gray-400 hover:text-gray-700"
                              >
                                <Edit3 size={14} />
                              </button>
                              {communityDeleteConfirm === community.id ? (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleCommunityDelete(community.id)}
                                    disabled={saving === community.id}
                                    className="px-2 py-0.5 text-xs bg-red-500 text-white rounded"
                                  >
                                    确认
                                  </button>
                                  <button
                                    onClick={() => setCommunityDeleteConfirm(null)}
                                    className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setCommunityDeleteConfirm(community.id)}
                                  className="p-1 text-gray-400 hover:text-red-600"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {sortedCommunities.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-gray-500">
                            暂无小区，点击上方添加
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 内容区域 */}
        <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
          {/* 搜索和筛选 */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索案例名称、小区、风格或设计师..."
                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-3 bg-white border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors cursor-pointer"
            >
              <option value="">全部状态</option>
              <option value="published">已发布</option>
              <option value="draft">草稿</option>
            </select>
            <select
              value={filterCommunity}
              onChange={(e) => setFilterCommunity(e.target.value)}
              className="px-4 py-3 bg-white border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors cursor-pointer"
            >
              <option value="">全部小区</option>
              {communities.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <div className="flex gap-1 bg-white border border-gray-200 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
              >
                <List size={18} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-lg p-12 text-center">
              <p className="text-gray-500">加载中...</p>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center">
              <p className="text-gray-500 mb-4">暂无案例</p>
              <button
                onClick={() => navigate('/admin/cases/new')}
                className="text-sm text-black hover:underline"
              >
                创建第一个案例
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* 网格视图 - 点击进入编辑 */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredCases.map((caseItem) => (
                <div 
                  key={caseItem.id} 
                  className="bg-white rounded-lg overflow-hidden group cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => navigate(`/admin/cases/edit/${caseItem.id}`)}
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img
                      src={caseItem.coverImage}
                      alt={caseItem.name}
                      className="w-full h-full object-cover"
                    />
                    {/* 状态标签 */}
                    <div className={`absolute top-2 left-2 text-xs px-2 py-1 rounded ${
                      caseItem.status === 'published' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-gray-500 text-white'
                    }`}>
                      {caseItem.status === 'published' ? '已发布' : '草稿'}
                    </div>
                    {caseItem.featured && (
                      <div className="absolute top-2 left-14 bg-amber-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <span className="text-[10px]">★</span>
                        <span>推荐</span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      #{caseItem.sortOrder}
                    </div>
                    {/* 悬停显示编辑提示 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <span className="text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        点击编辑
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 truncate mb-1">{caseItem.name}</h3>
                    <p className="text-sm text-gray-500 mb-2">{caseItem.houseType} · {caseItem.style}</p>
                    <p className="text-xs text-gray-400 mb-3">{caseItem.community}</p>
                    
                    {/* 设计师信息 */}
                    {(() => {
                      const designer = getDesignerById(caseItem.designerId)
                      return designer ? (
                        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
                          {designer.avatar ? (
                            <img
                              src={designer.avatar}
                              alt={designer.name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                              <User size={14} className="text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{designer.name}</p>
                          </div>
                        </div>
                      ) : null
                    })()}
                    
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">{caseItem.images.length + 1} 图</span>
                      <div className="flex-1" />
                      {/* 上线/下线按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePublishToggle(caseItem)
                        }}
                        disabled={saving === caseItem.id}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          caseItem.status === 'published'
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {caseItem.status === 'published' ? '下线' : '上线'}
                      </button>
                      {/* 删除按钮 */}
                      {deleteConfirm === caseItem.id ? (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDelete(caseItem.id)}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm(caseItem.id)
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 列表视图 */
            <div className="bg-white rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">封面</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">案例信息</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">设计师</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">小区</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">状态</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">推荐</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCases.map((caseItem, index) => (
                    <tr key={caseItem.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/cases/edit/${caseItem.id}`)}>
                      <td className="px-4 py-3">
                        <span className="text-gray-400 text-sm">{caseItem.sortOrder}</span>
                      </td>
                      <td className="px-4 py-3">
                        <img
                          src={caseItem.coverImage}
                          alt={caseItem.name}
                          className="w-20 h-14 object-cover rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{caseItem.name}</p>
                        <p className="text-sm text-gray-500">{caseItem.houseType} · {caseItem.style}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {(() => {
                          const designer = getDesignerById(caseItem.designerId)
                          return designer ? (
                            <div className="flex items-center gap-2">
                              {designer.avatar ? (
                                <img
                                  src={designer.avatar}
                                  alt={designer.name}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                  <User size={14} className="text-gray-400" />
                                </div>
                              )}
                              <span className="text-gray-700">{designer.name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-gray-700">{caseItem.community}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded ${
                          caseItem.status === 'published' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {caseItem.status === 'published' ? '已发布' : '草稿'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {caseItem.featured ? (
                          <span className="text-amber-500 text-sm">★ 推荐</span>
                        ) : (
                          <span className="text-gray-300 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleSort(caseItem.id, 'up')}
                            disabled={saving !== null || index === 0}
                            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"
                            title="上移"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => handleSort(caseItem.id, 'down')}
                            disabled={saving !== null || index === filteredCases.length - 1}
                            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"
                            title="下移"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            onClick={() => handlePublishToggle(caseItem)}
                            disabled={saving === caseItem.id}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              caseItem.status === 'published'
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                          >
                            {caseItem.status === 'published' ? '下线' : '上线'}
                          </button>
                          {deleteConfirm === caseItem.id ? (
                            <>
                              <button
                                onClick={() => handleDelete(caseItem.id)}
                                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                确认
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(caseItem.id)}
                              className="p-1.5 text-gray-500 hover:text-red-600 transition-colors"
                              title="删除"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* 小区编辑弹窗 */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="font-medium">
                  {editingCommunity ? '编辑小区' : '添加小区'}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    小区名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={communityFormData.name}
                    onChange={(e) => setCommunityFormData({ ...communityFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
                    placeholder="请输入小区名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    封面图
                  </label>
                  {communityFormData.coverImage ? (
                    <div className="relative w-full h-32 rounded border overflow-hidden">
                      <img src={communityFormData.coverImage} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setCommunityFormData({ ...communityFormData, coverImage: '' })}
                        className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded hover:bg-black/70"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <label className="block w-full h-24 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-300">
                      {uploading ? (
                        <p className="text-sm text-gray-400">上传中...</p>
                      ) : (
                        <>
                          <Plus size={20} className="text-gray-300 mb-1" />
                          <p className="text-xs text-gray-400">点击上传封面图</p>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCommunityCoverUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    排序号
                  </label>
                  <input
                    type="number"
                    value={communityFormData.sortOrder}
                    onChange={(e) => setCommunityFormData({ ...communityFormData, sortOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">数字越小越靠前</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    小区简介
                  </label>
                  <textarea
                    value={communityFormData.description}
                    onChange={(e) => setCommunityFormData({ ...communityFormData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 resize-none"
                    rows={2}
                    placeholder="可选"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="showOnHome"
                    checked={communityFormData.showOnHome}
                    onChange={(e) => setCommunityFormData({ ...communityFormData, showOnHome: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="showOnHome" className="text-sm">在首页展示</label>
                </div>
              </div>
              <div className="px-6 py-4 border-t flex justify-end gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleCommunitySave}
                  disabled={saving !== null}
                  className="px-4 py-2 text-sm text-white bg-black rounded hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
